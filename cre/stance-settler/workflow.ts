import {
	bytesToHex,
	ConsensusAggregationByFields,
	CronCapability,
	EVMClient,
	encodeCallMsg,
	getNetwork,
	type HTTPSendRequester,
	HTTPClient,
	handler,
	hexToBase64,
	LAST_FINALIZED_BLOCK_NUMBER,
	LATEST_BLOCK_NUMBER,
	median,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeErrorResult,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	type Hex,
	parseAbiParameters,
	zeroAddress,
} from 'viem'
import { z } from 'zod'
import { AggregatorV3Abi, Multicall3Abi, SpreadSeriesAbi, StanceMarketAbi } from './abi'

// ─── Config ─────────────────────────────────────────────────────────────────
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x-prefixed 20-byte address')

export const configSchema = z.object({
	/** CRE cron schedule (6 fields, seconds first). */
	schedule: z.string(),
	/** CRE chain name, e.g. "ethereum-testnet-sepolia-base-1". */
	chainSelectorName: z.string(),
	isTestnet: z.boolean().default(true),
	/** StanceMarket registry (contracts/deployments/84532.json → "market"). */
	marketAddress: address,
	/** SettlementReceiver, the CRE consumer (deployments → "receiver"). */
	receiverAddress: address,
	/** Chainlink ETH/USD AggregatorV3 proxy (deployments → "feed"). */
	feedAddress: address,
	/** Multicall3, used to batch view calls into one EVM read. */
	multicallAddress: address.default('0xcA11bde05977b3631167028862bE2a173976CA11'),
	/** Gas limit for the report delivery transaction (quota: 10M). */
	gasLimit: z.string().default('5000000'),
	/** "latest" settles faster; "finalized" reads only finalized state. */
	blockConfidence: z.enum(['latest', 'finalized']).default('latest'),
	/** How many feed rounds back from the latest round the search may look. */
	maxRoundsBack: z.number().int().positive().default(2000),
	/** View calls batched into one Multicall3 read (keeps each read under the 5 KB payload quota). */
	callsPerRead: z.number().int().min(2).max(32).default(16),
	/** EVM read budget per execution (quota PerWorkflow.ChainRead.CallLimit = 15). */
	maxEvmReads: z.number().int().positive().default(15),
	/** Distinct expiries searched per run; one HTTP reference call each (quota: 15 HTTP calls). */
	maxExpiriesPerRun: z.number().int().positive().default(5),
	/** Max series settled in one report (one preflight read covers callsPerRead entries). */
	maxSeriesPerRun: z.number().int().positive().default(16),
	/** Coinbase spot endpoint, logged against the latest Chainlink answer every run. */
	spotApiUrl: z.string().default('https://api.coinbase.com/v2/prices/ETH-USD/spot'),
	/** Coinbase Exchange candles endpoint: historical reference price at the settlement round's time. */
	candlesApiUrl: z.string().default('https://api.exchange.coinbase.com/products/ETH-USD/candles'),
	/** Max |chainlink - reference| / reference, in basis points (200 = 2%). */
	maxDeviationBps: z.number().int().positive().default(200),
	/** If the reference API is down, skip settlement (true) or settle on Chainlink alone (false). */
	requireReference: z.boolean().default(true),
})
export type Config = z.infer<typeof configSchema>

// Matches SpreadSeries.MAX_SETTLEMENT_DELAY.
const MAX_SETTLEMENT_DELAY = 86_400n
const FEED_DECIMALS = 1e8
const AGG_MASK = (1n << 64n) - 1n

type Round = { answer: bigint; updatedAt: bigint }
type Candidate = {
	expiry: bigint
	roundId: bigint
	answer: bigint
	updatedAt: bigint
	series: Address[]
	vaults: Address[]
}

// ─── EVM read helpers ───────────────────────────────────────────────────────
class Reader {
	reads = 0
	constructor(
		private readonly runtime: Runtime<Config>,
		private readonly evm: EVMClient,
	) {}

	get remaining(): number {
		return this.runtime.config.maxEvmReads - this.reads
	}

	private get block() {
		return this.runtime.config.blockConfidence === 'finalized'
			? LAST_FINALIZED_BLOCK_NUMBER
			: LATEST_BLOCK_NUMBER
	}

	/** One EVM read (eth_call). */
	call(to: Address, data: Hex): Hex {
		if (this.remaining <= 0) throw new Error('EVM read budget exhausted')
		this.reads++
		const res = this.evm
			.callContract(this.runtime, {
				call: encodeCallMsg({ from: zeroAddress, to, data }),
				blockNumber: this.block,
			})
			.result()
		return bytesToHex(res.data)
	}

	/** Many calls in one EVM read through Multicall3.aggregate3 (allowFailure = true). */
	multicall(calls: { target: Address; callData: Hex }[]): { success: boolean; returnData: Hex }[] {
		const out: { success: boolean; returnData: Hex }[] = []
		const size = this.runtime.config.callsPerRead
		for (let i = 0; i < calls.length; i += size) {
			const chunk = calls.slice(i, i + size).map((c) => ({ ...c, allowFailure: true }))
			const data = encodeFunctionData({ abi: Multicall3Abi, functionName: 'aggregate3', args: [chunk] })
			const raw = this.call(this.runtime.config.multicallAddress as Address, data)
			const results = decodeFunctionResult({ abi: Multicall3Abi, functionName: 'aggregate3', data: raw })
			out.push(...results.map((r) => ({ success: r.success, returnData: r.returnData })))
		}
		return out
	}
}

const decodeRound = (data: Hex): Round => {
	const [, answer, , updatedAt] = decodeFunctionResult({
		abi: AggregatorV3Abi,
		functionName: 'getRoundData',
		data,
	})
	return { answer, updatedAt }
}

const fmtPrice = (answer: bigint): string => (Number(answer) / FEED_DECIMALS).toFixed(2)

const describeRevert = (data: Hex): string => {
	try {
		const err = decodeErrorResult({ abi: SpreadSeriesAbi, data })
		return err.args?.length ? `${err.errorName}(${err.args.join(', ')})` : err.errorName
	} catch {
		return data === '0x' ? 'reverted' : data.slice(0, 74)
	}
}

// ─── Settlement round search ────────────────────────────────────────────────
/**
 * Finds the first feed round with updatedAt >= expiry whose previous round has updatedAt < expiry
 * (the rule SpreadSeries.settle enforces). updatedAt is monotone in the round id within a phase,
 * so this is a k-ary search: each EVM read probes `callsPerRead` round ids at once. Searching
 * 2000 rounds back takes about 3 reads instead of 2000.
 */
function findSettlementRound(
	runtime: Runtime<Config>,
	reader: Reader,
	feed: Address,
	latestRoundId: bigint,
	latest: Round,
	expiry: bigint,
): { roundId: bigint; round: Round } | { skip: string } {
	if (latest.updatedAt < expiry) return { skip: 'no feed round at or after expiry yet' }

	const phase = latestRoundId >> 64n
	const latestAgg = latestRoundId & AGG_MASK
	const known = new Map<bigint, Round>([[latestAgg, latest]])

	let hi = latestAgg // known: updatedAt >= expiry
	let lo = latestAgg - BigInt(runtime.config.maxRoundsBack)
	if (lo < 1n) lo = 1n
	let loVerified = false // becomes true once round `lo` is known to be < expiry

	const k = BigInt(runtime.config.callsPerRead)
	while (!loVerified || hi - lo > 1n) {
		if (reader.remaining <= 1) return { skip: 'EVM read budget exhausted during round search' }

		// Probe ids: lo itself (until verified) plus evenly spaced interior points of (lo, hi).
		const ids: bigint[] = []
		if (!loVerified) ids.push(lo)
		const gap = hi - lo - 1n
		const slots = k - BigInt(ids.length)
		if (gap <= slots) {
			for (let id = lo + 1n; id < hi; id++) ids.push(id)
		} else {
			for (let i = 1n; i <= slots; i++) {
				const id = lo + (i * (hi - lo)) / (slots + 1n)
				if (id > lo && id < hi && ids[ids.length - 1] !== id) ids.push(id)
			}
		}
		const results = reader.multicall(
			ids.map((id) => ({
				target: feed,
				callData: encodeFunctionData({
					abi: AggregatorV3Abi,
					functionName: 'getRoundData',
					args: [(phase << 64n) | id],
				}),
			})),
		)

		for (let i = 0; i < ids.length; i++) {
			const id = ids[i]
			const r = results[i]
			if (!r.success) {
				if (id === lo && !loVerified && lo === 1n) {
					// no data before the phase start: treat as "before expiry"
					loVerified = true
					continue
				}
				return { skip: `getRoundData(${(phase << 64n) | id}) failed` }
			}
			const round = decodeRound(r.returnData)
			known.set(id, round)
			if (round.updatedAt >= expiry) {
				if (id < hi) hi = id
			} else if (id >= lo) {
				lo = id
				loVerified = true
			}
		}
		if (!loVerified) {
			return { skip: `settlement round is more than ${runtime.config.maxRoundsBack} rounds back` }
		}
	}

	const round = known.get(hi)
	if (!round) return { skip: 'internal: settlement round not loaded' }
	if (round.answer <= 0n) return { skip: 'settlement round has a non-positive answer' }
	if (round.updatedAt > expiry + MAX_SETTLEMENT_DELAY) {
		return { skip: 'first post-expiry round is more than 1 day after expiry' }
	}
	return { roundId: (phase << 64n) | hi, round }
}

// ─── Off-chain reference (HTTP capability) ──────────────────────────────────
type PriceObs = { price: number }

const fetchSpot = (sendRequester: HTTPSendRequester, url: string): PriceObs => {
	const resp = sendRequester
		.sendRequest({ url, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'stance-cre' } })
		.result()
	if (resp.statusCode !== 200) throw new Error(`spot API returned ${resp.statusCode}`)
	const body = JSON.parse(new TextDecoder().decode(resp.body)) as { data?: { amount?: string } }
	const price = Number(body.data?.amount)
	if (!Number.isFinite(price) || price <= 0) throw new Error('spot API: bad price')
	return { price }
}

/** Close of the 1-minute Coinbase candle containing `at` (unix seconds). */
const fetchCandleClose = (sendRequester: HTTPSendRequester, baseUrl: string, at: number): PriceObs => {
	const iso = (s: number) => new Date(s * 1000).toISOString()
	const url = `${baseUrl}?granularity=60&start=${iso(at - 300)}&end=${iso(at + 60)}`
	const resp = sendRequester
		.sendRequest({ url, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'stance-cre' } })
		.result()
	if (resp.statusCode !== 200) throw new Error(`candles API returned ${resp.statusCode}`)
	// rows: [time, low, high, open, close, volume], newest first
	const rows = JSON.parse(new TextDecoder().decode(resp.body)) as number[][]
	let best: number[] | undefined
	for (const row of rows) {
		if (row[0] <= at && (!best || row[0] > best[0])) best = row
	}
	if (!best) throw new Error('candles API: no candle at or before the round time')
	return { price: best[4] }
}

// SDK 1.23 takes a factory per field (`median`), while some doc pages show `median<number>()`.
const priceAggregation = () => ConsensusAggregationByFields<PriceObs>({ price: median })

// ─── Callback ───────────────────────────────────────────────────────────────
export const onCronTrigger = (runtime: Runtime<Config>): string => {
	const cfg = runtime.config
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: cfg.chainSelectorName,
		isTestnet: cfg.isTestnet,
	})
	if (!network) throw new Error(`Network not found: ${cfg.chainSelectorName}`)

	const evm = new EVMClient(network.chainSelector.selector)
	const reader = new Reader(runtime, evm)
	const http = new HTTPClient()
	const feed = cfg.feedAddress as Address
	const now = BigInt(Math.floor(runtime.now().getTime() / 1000))

	// 1. EVM read: the registry
	const ranges = decodeFunctionResult({
		abi: StanceMarketAbi,
		functionName: 'allRanges',
		data: reader.call(
			cfg.marketAddress as Address,
			encodeFunctionData({ abi: StanceMarketAbi, functionName: 'allRanges' }),
		),
	})
	const expired = ranges.filter((r) => r.expiry <= now)
	runtime.log(`[stance] ${ranges.length} ranges registered, ${expired.length} past expiry (now=${now})`)

	// 2. EVM read (batched): latest feed round + settled() of every expired series
	const status = reader.multicall([
		{ target: feed, callData: encodeFunctionData({ abi: AggregatorV3Abi, functionName: 'latestRoundData' }) },
		...expired.map((r) => ({
			target: r.series,
			callData: encodeFunctionData({ abi: SpreadSeriesAbi, functionName: 'settled' }),
		})),
	])
	if (!status[0].success) throw new Error('feed.latestRoundData() failed')
	const [latestRoundId, latestAnswer, , latestUpdatedAt] = decodeFunctionResult({
		abi: AggregatorV3Abi,
		functionName: 'latestRoundData',
		data: status[0].returnData,
	})
	const latest: Round = { answer: latestAnswer, updatedAt: latestUpdatedAt }
	runtime.log(`[chainlink] latest round ${latestRoundId}: $${fmtPrice(latestAnswer)} at ${latestUpdatedAt}`)

	// 3. HTTP: independent spot reference, logged every run
	try {
		const spot = http.sendRequest(runtime, fetchSpot, priceAggregation())(cfg.spotApiUrl).result()
		const devBps = (Math.abs(Number(latestAnswer) / FEED_DECIMALS - spot.price) / spot.price) * 10_000
		runtime.log(`[coinbase] spot $${spot.price.toFixed(2)}; latest Chainlink deviates ${devBps.toFixed(1)} bps`)
	} catch (e) {
		runtime.log(`[coinbase] spot fetch failed: ${(e as Error).message}`)
	}

	// Unsettled expired series, grouped by expiry (ranges usually share expiries).
	const byExpiry = new Map<bigint, { series: Address[]; vaults: Address[] }>()
	expired.forEach((r, i) => {
		const s = status[i + 1]
		let isSettled = true
		if (s.success) {
			isSettled = decodeFunctionResult({ abi: SpreadSeriesAbi, functionName: 'settled', data: s.returnData })
		} else {
			runtime.log(`[stance] settled() failed for ${r.series}; skipping`)
		}
		if (isSettled) return
		const g = byExpiry.get(r.expiry) ?? { series: [], vaults: [] }
		g.series.push(r.series)
		g.vaults.push(r.vault)
		byExpiry.set(r.expiry, g)
	})
	const expiries = [...byExpiry.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
	if (expiries.length === 0) {
		runtime.log('[stance] nothing to settle')
		return JSON.stringify({ settled: 0, reason: 'nothing to settle' })
	}
	if (expiries.length > cfg.maxExpiriesPerRun) {
		runtime.log(`[stance] ${expiries.length} expiries pending; handling the oldest ${cfg.maxExpiriesPerRun} this run`)
	}

	// 4. Find each expiry's settlement round, then check it against the off-chain reference.
	const candidates: Candidate[] = []
	for (const expiry of expiries.slice(0, cfg.maxExpiriesPerRun)) {
		const group = byExpiry.get(expiry)!
		const found = findSettlementRound(runtime, reader, feed, latestRoundId, latest, expiry)
		if ('skip' in found) {
			runtime.log(`[stance] expiry ${expiry} (${group.series.length} series): skip, ${found.skip}`)
			continue
		}
		const { roundId, round } = found
		const clPrice = Number(round.answer) / FEED_DECIMALS
		runtime.log(`[chainlink] expiry ${expiry}: round ${roundId} $${clPrice.toFixed(2)} at ${round.updatedAt}`)

		let ref: number | undefined
		try {
			ref = http
				.sendRequest(runtime, fetchCandleClose, priceAggregation())(cfg.candlesApiUrl, Number(round.updatedAt))
				.result().price
		} catch (e) {
			runtime.log(`[coinbase] reference fetch failed for expiry ${expiry}: ${(e as Error).message}`)
		}
		if (ref === undefined) {
			if (cfg.requireReference) {
				runtime.log(`[stance] expiry ${expiry}: skip, no off-chain reference (requireReference=true)`)
				continue
			}
		} else {
			const devBps = (Math.abs(clPrice - ref) / ref) * 10_000
			const ok = devBps <= cfg.maxDeviationBps
			runtime.log(
				`[check] expiry ${expiry}: chainlink $${clPrice.toFixed(2)} vs coinbase $${ref.toFixed(2)} → ${devBps.toFixed(1)} bps ${ok ? 'OK' : `> ${cfg.maxDeviationBps} bps, SKIP`}`,
			)
			if (!ok) continue
		}
		candidates.push({ expiry, roundId, answer: round.answer, updatedAt: round.updatedAt, ...group })
	}

	// Flatten to report entries.
	let series: Address[] = []
	let vaults: Address[] = []
	let roundIds: bigint[] = []
	for (const c of candidates) {
		for (let i = 0; i < c.series.length; i++) {
			series.push(c.series[i])
			vaults.push(c.vaults[i])
			roundIds.push(c.roundId)
		}
	}
	if (series.length > cfg.maxSeriesPerRun) {
		runtime.log(`[stance] ${series.length} series ready; settling ${cfg.maxSeriesPerRun} this run`)
		series = series.slice(0, cfg.maxSeriesPerRun)
		vaults = vaults.slice(0, cfg.maxSeriesPerRun)
		roundIds = roundIds.slice(0, cfg.maxSeriesPerRun)
	}
	if (series.length === 0) {
		runtime.log('[stance] no series passed the checks')
		return JSON.stringify({ settled: 0, reason: 'no series passed the checks' })
	}

	// 5. Preflight: eth_call series.settle(roundId) for each entry so the report only carries
	//    entries the contract will accept (one EVM read per callsPerRead entries).
	const preflightReads = Math.ceil(series.length / cfg.callsPerRead)
	if (reader.remaining >= preflightReads) {
		const pre = reader.multicall(
			series.map((s, i) => ({
				target: s,
				callData: encodeFunctionData({ abi: SpreadSeriesAbi, functionName: 'settle', args: [roundIds[i]] }),
			})),
		)
		const keep = pre.map((r, i) => {
			if (!r.success) runtime.log(`[preflight] ${series[i]} settle(${roundIds[i]}) would revert: ${describeRevert(r.returnData)}`)
			return r.success
		})
		series = series.filter((_, i) => keep[i])
		vaults = vaults.filter((_, i) => keep[i])
		roundIds = roundIds.filter((_, i) => keep[i])
		if (series.length === 0) {
			runtime.log('[stance] every entry failed preflight; not writing')
			return JSON.stringify({ settled: 0, reason: 'preflight rejected all entries' })
		}
	} else {
		runtime.log('[preflight] skipped (EVM read budget); SettlementReceiver tolerates bad entries')
	}

	// 6. Report: abi.encode(address[] series, address[] vaults, uint80[] roundIds)
	const reportData = encodeAbiParameters(
		parseAbiParameters('address[] series, address[] vaults, uint80[] roundIds'),
		[series, vaults, roundIds],
	)
	runtime.log(`[report] settling ${series.length} series: ${series.map((s, i) => `${s}@${roundIds[i]}`).join(', ')}`.slice(0, 1000))

	const report = runtime
		.report({
			encodedPayload: hexToBase64(reportData),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	// 7. EVM write: Forwarder → SettlementReceiver.onReport(metadata, report)
	const write = evm
		.writeReport(runtime, {
			receiver: cfg.receiverAddress,
			report,
			gasConfig: { gasLimit: cfg.gasLimit },
		})
		.result()

	const txHash = bytesToHex(write.txHash ?? new Uint8Array(32))
	if (write.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`settlement tx failed: ${write.errorMessage || TxStatus[write.txStatus]}`)
	}
	if (/^0x0+$/.test(txHash)) {
		runtime.log('[write] dry run: report prepared, not broadcast (re-run simulate with --broadcast to send it)')
	} else {
		runtime.log(`[write] SettlementReceiver report delivered, tx ${txHash} (https://sepolia.basescan.org/tx/${txHash})`)
	}
	runtime.log(`[stance] EVM reads used: ${reader.reads}/${cfg.maxEvmReads}`)

	return JSON.stringify({
		settled: series.length,
		txHash,
		entries: series.map((s, i) => ({ series: s, roundId: roundIds[i].toString() })),
	})
}

// ─── Workflow init ──────────────────────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cron = new CronCapability()
	return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}
