// Unit tests against an in-memory fake of Base Sepolia (market, series, Chainlink feed, Multicall3)
// using the CRE SDK test runtime. Run: bun test
import { describe, expect } from 'bun:test'
import { hexToBase64, TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, REPORT_METADATA_HEADER_LENGTH, test } from '@chainlink/cre-sdk/test'
import {
	type Address,
	bytesToHex,
	decodeAbiParameters,
	decodeFunctionData,
	encodeErrorResult,
	encodeFunctionResult,
	type Hex,
	parseAbiParameters,
} from 'viem'
import { AggregatorV3Abi, Multicall3Abi, SpreadSeriesAbi, StanceMarketAbi } from './abi'
import { type Config, configSchema, initWorkflow, onCronTrigger } from './workflow'

const BASE_SEPOLIA = 10344971235874465080n // ethereum-testnet-sepolia-base-1
const MARKET = '0x00000000000000000000000000000000000000a1' as Address
const RECEIVER = '0x00000000000000000000000000000000000000a2' as Address
const FEED = '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1' as Address
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const PHASE = 3n
const T0 = 1_790_000_000n
const HEARTBEAT = 600n
const N_ROUNDS = 3000n
const PRICE = 224_644_142_804n // $2246.44

const roundTs = (agg: bigint) => T0 + agg * HEARTBEAT + (agg % 7n) * 11n // monotone, slightly irregular
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address

type Fake = {
	now: bigint
	ranges: { series: Address; vault: Address; expiry: bigint; settled: boolean }[]
	reads: number
	written?: { series: readonly Address[]; vaults: readonly Address[]; roundIds: readonly bigint[] }
}

function execute(f: Fake, to: string, data: Hex): { success: boolean; returnData: Hex } {
	to = to.toLowerCase()
	if (to === MARKET.toLowerCase()) {
		const ranges = f.ranges.map((r) => ({ series: r.series, vault: r.vault, k1: 1n, k2: 2n, expiry: r.expiry }))
		return { success: true, returnData: encodeFunctionResult({ abi: StanceMarketAbi, functionName: 'allRanges', result: ranges }) }
	}
	if (to === MULTICALL.toLowerCase()) {
		const { args } = decodeFunctionData({ abi: Multicall3Abi, data })
		const results = args[0].map((c) => execute(f, c.target, c.callData))
		return { success: true, returnData: encodeFunctionResult({ abi: Multicall3Abi, functionName: 'aggregate3', result: results }) }
	}
	if (to === FEED.toLowerCase()) {
		const call = decodeFunctionData({ abi: AggregatorV3Abi, data })
		const id = call.functionName === 'latestRoundData' ? (PHASE << 64n) | N_ROUNDS : call.args[0]
		const agg = id & ((1n << 64n) - 1n)
		if (id >> 64n !== PHASE || agg === 0n || agg > N_ROUNDS) return { success: false, returnData: '0x' }
		const result = [id, PRICE, roundTs(agg), roundTs(agg), id] as const
		return { success: true, returnData: encodeFunctionResult({ abi: AggregatorV3Abi, functionName: 'getRoundData', result }) }
	}
	const range = f.ranges.find((r) => r.series.toLowerCase() === to)
	if (range) {
		const call = decodeFunctionData({ abi: SpreadSeriesAbi, data })
		if (call.functionName === 'settled') {
			return { success: true, returnData: encodeFunctionResult({ abi: SpreadSeriesAbi, functionName: 'settled', result: range.settled }) }
		}
		// SpreadSeries.settle rules
		const revert = (errorName: 'NotExpired' | 'AlreadySettled' | 'InvalidRound') => ({
			success: false,
			returnData: encodeErrorResult({ abi: SpreadSeriesAbi, errorName }),
		})
		if (range.settled) return revert('AlreadySettled')
		if (f.now < range.expiry) return revert('NotExpired')
		const agg = call.args[0] & ((1n << 64n) - 1n)
		const ts = roundTs(agg)
		if (ts < range.expiry || ts > range.expiry + 86_400n) return revert('InvalidRound')
		if (agg > 1n && roundTs(agg - 1n) >= range.expiry) return revert('InvalidRound')
		return { success: true, returnData: '0x' }
	}
	throw new Error(`unexpected call to ${to}`)
}

function setup(f: Fake, opts: { refPrice?: number; spotPrice?: number } = {}) {
	const evm = EvmMock.testInstance(BASE_SEPOLIA)
	evm.callContract = (input) => {
		f.reads++
		const r = execute(f, bytesToHex(input.call!.to), bytesToHex(input.call!.data))
		return { data: hexToBase64(r.returnData) }
	}
	evm.writeReport = (input) => {
		const raw = input.report!.rawReport
		const payload = bytesToHex(raw.slice(REPORT_METADATA_HEADER_LENGTH))
		const [series, vaults, roundIds] = decodeAbiParameters(
			parseAbiParameters('address[] series, address[] vaults, uint80[] roundIds'),
			payload,
		)
		f.written = { series, vaults, roundIds }
		return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32).fill(0xab) }
	}
	const http = HttpActionsMock.testInstance()
	http.sendRequest = (req) => {
		let body: string
		if (req.url.includes('/spot')) {
			body = JSON.stringify({ data: { amount: String(opts.spotPrice ?? 2247.15), base: 'ETH', currency: 'USD' } })
		} else {
			const start = new URL(req.url).searchParams.get('start')!
			const at = Math.floor(Date.parse(start) / 1000) + 300
			const t = at - (at % 60)
			const close = opts.refPrice ?? 2248.06
			body = JSON.stringify([[t, close - 2, close + 2, close - 1, close, 100], [t - 60, 1, 2, 3, 4, 5]])
		}
		return { statusCode: 200, body: Buffer.from(body).toString('base64') }
	}
}

const config = (over: Partial<Config> = {}): Config =>
	configSchema.parse({
		schedule: '0 */10 * * * *',
		chainSelectorName: 'ethereum-testnet-sepolia-base-1',
		marketAddress: MARKET,
		receiverAddress: RECEIVER,
		feedAddress: FEED,
		...over,
	})

const run = (f: Fake, cfg = config()) => {
	const runtime = newTestRuntime(null, { timeProvider: () => Number(f.now) * 1000 }, cfg)
	const out = onCronTrigger(runtime as any)
	const logs = runtime.getLogs().join('\n')
	if (process.env.SHOW_LOGS) console.log(`${logs}\n(EVM reads: ${f.reads})\n`)
	return { out: JSON.parse(out), logs }
}

// expiry falls strictly between rounds 2500 and 2501
const EXPIRY = roundTs(2500n) + 5n
const FIRST_ROUND = (PHASE << 64n) | 2501n

describe('stance-settler', () => {
	test('nothing to settle before expiry; still logs the Coinbase spot check', () => {
		const f: Fake = { now: EXPIRY - 10n, ranges: [{ series: addr(1), vault: addr(101), expiry: EXPIRY, settled: false }], reads: 0 }
		setup(f)
		const { out, logs } = run(f)
		expect(out.settled).toBe(0)
		expect(logs).toContain('[coinbase] spot $2247.15')
		expect(f.written).toBeUndefined()
	})

	test('settles every unsettled expired series with the first round at/after expiry', () => {
		const f: Fake = {
			now: roundTs(N_ROUNDS),
			ranges: [
				{ series: addr(1), vault: addr(101), expiry: EXPIRY, settled: false },
				{ series: addr(2), vault: addr(102), expiry: EXPIRY, settled: false },
				{ series: addr(3), vault: addr(103), expiry: EXPIRY, settled: true },
				{ series: addr(4), vault: addr(104), expiry: roundTs(N_ROUNDS) + 999n, settled: false },
			],
			reads: 0,
		}
		setup(f)
		const { out, logs } = run(f)
		expect(out.settled).toBe(2)
		expect(f.written!.series).toEqual([addr(1), addr(2)])
		expect(f.written!.vaults).toEqual([addr(101), addr(102)])
		expect(f.written!.roundIds).toEqual([FIRST_ROUND, FIRST_ROUND])
		expect(logs).toContain('OK')
		expect(f.reads).toBeLessThanOrEqual(15)
	})

	test('skips when Chainlink and Coinbase disagree by more than 2%', () => {
		const f: Fake = { now: roundTs(N_ROUNDS), ranges: [{ series: addr(1), vault: addr(101), expiry: EXPIRY, settled: false }], reads: 0 }
		setup(f, { refPrice: 2400 })
		const { out, logs } = run(f)
		expect(out.settled).toBe(0)
		expect(logs).toContain('SKIP')
		expect(f.written).toBeUndefined()
	})

	test('skips when the settlement round is older than maxRoundsBack', () => {
		const f: Fake = { now: roundTs(N_ROUNDS), ranges: [{ series: addr(1), vault: addr(101), expiry: EXPIRY, settled: false }], reads: 0 }
		setup(f)
		const { out, logs } = run(f, config({ maxRoundsBack: 200 }))
		expect(out.settled).toBe(0)
		expect(logs).toContain('more than 200 rounds back')
	})

	test('finds rounds anywhere in a 2000-round window within the read budget', () => {
		for (const agg of [1001n, 1002n, 1500n, 2999n, 3000n]) {
			const expiry = roundTs(agg - 1n) + 1n
			const f: Fake = { now: roundTs(N_ROUNDS) + 60n, ranges: [{ series: addr(9), vault: addr(109), expiry, settled: false }], reads: 0 }
			setup(f)
			run(f)
			expect(f.written!.roundIds).toEqual([(PHASE << 64n) | agg])
			expect(f.reads).toBeLessThanOrEqual(15)
		}
	})

	test('initWorkflow registers one cron handler', () => {
		const handlers = initWorkflow(config())
		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onCronTrigger)
	})
})
