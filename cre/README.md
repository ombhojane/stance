# Stance × Chainlink CRE: automated settlement

`stance-settler` is a Chainlink Runtime Environment (CRE) workflow in TypeScript. On a cron schedule it finds Stance ranges that have expired, works out the Chainlink ETH/USD round each one must settle at, checks that price against Coinbase, and writes a signed report to `SettlementReceiver`. The receiver then settles every series and closes its house vault.

Settlement is permissionless and the contract validates it (`SpreadSeries.settle`), so anyone could settle a series by hand. The workflow's job is to make sure someone always does it, promptly and with a price that has been checked.

## What it does (one execution)

```
cron (every 10 min)
 ├─ EVM read   StanceMarket.allRanges()                         → ranges with expiry <= DON time
 ├─ EVM read   Multicall3: feed.latestRoundData() + series.settled() for each expired series
 ├─ HTTP       Coinbase spot ETH-USD → logged against the latest Chainlink answer
 ├─ for each distinct unsettled expiry:
 │    ├─ EVM reads  k-ary search over feed rounds (16 getRoundData per read via Multicall3)
 │    │             → first round with updatedAt >= expiry whose previous round is < expiry,
 │    │               skipped if updatedAt > expiry + 1 day (SpreadSeries.MAX_SETTLEMENT_DELAY)
 │    └─ HTTP       Coinbase Exchange 1-minute candle at that round's updatedAt
 │                  → kept only if |chainlink - coinbase| <= 2% (maxDeviationBps), otherwise logged and skipped
 ├─ EVM read   preflight: eth_call series.settle(roundId) for every entry; entries that would revert are dropped
 ├─ runtime.report(abi.encode(address[] series, address[] vaults, uint80[] roundIds))
 └─ EVM write  evmClient.writeReport → Forwarder → SettlementReceiver.onReport(metadata, report)
```

Design notes:

- **Read budget.** CRE allows only 15 EVM reads per execution (`PerWorkflow.ChainRead.CallLimit`) and 5 KB per read payload (https://docs.chain.link/cre/service-quotas). Walking back up to 200 rounds one `getRoundData` at a time would not fit. The workflow batches calls through Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`, 16 calls per read). It finds the round with a 16-way search, which relies on `updatedAt` never decreasing within a phase. A window of 2,000 rounds (`maxRoundsBack`) takes about 3 reads per expiry, and ranges that share an expiry share one search. In the unit tests a full settlement run uses 6 of the 15 reads.
- **Time.** "Now" comes from `runtime.now()` (DON time), not `Date.now()`.
- **Reference price.** The off-chain check uses the price at the settlement round's timestamp: the close of the Coinbase 1-minute candle. Current spot would be misleading when the expiry was hours ago. Spot is still fetched and logged on every run, so every simulation shows the HTTP integration even when nothing is due.
- **Consensus.** Both HTTP calls run per node and are reduced with `ConsensusAggregationByFields({ price: median })`.
- **Batch limits.** At most `maxSeriesPerRun` (16) series go into one report. Anything left over is picked up on the next cron tick. `SettlementReceiver` also tolerates bad entries.

### How it maps to the Chainlink "Best workflow with CRE" requirements

| Requirement | Where |
|---|---|
| Integrate at least one blockchain with an external API | Base Sepolia (EVM read and write) plus the Coinbase spot and candles REST APIs through the CRE HTTP capability. The API result gates which series are settled. |
| Demonstrate a successful simulation via the CRE CLI or a live deployment | `cre workflow simulate stance-settler --target staging-settings` (commands below) |
| Meaningfully used in the project | It is the settlement path for every Stance range: `SettlementReceiver` is the CRE consumer, and the app's payouts (`redeem`) unlock only after `settle` |

## Layout

```
cre/
├── project.yaml                 # RPC for ethereum-testnet-sepolia-base-1 (https://sepolia.base.org)
├── secrets.yaml                 # no secrets needed
├── scripts/sync-config.ts       # copies addresses from contracts/deployments/84532.json into the configs
└── stance-settler/
    ├── main.ts                  # Runner entry point
    ├── workflow.ts              # the workflow
    ├── abi.ts                   # StanceMarket / SpreadSeries / AggregatorV3 / Multicall3 ABIs
    ├── workflow.test.ts         # unit tests against an in-memory fake chain (CRE SDK test runtime)
    ├── workflow.yaml            # staging-settings / production-settings targets
    ├── config.staging.json      # blockConfidence "latest" (fast demo)
    ├── config.production.json   # blockConfidence "finalized"
    ├── package.json, tsconfig.json
```

## Config values

The values come from `contracts/deployments/84532.json`. They are already filled in, and `bun scripts/sync-config.ts` (run from `cre/`) re-syncs them after a redeploy.

| config key | deployments key | current value |
|---|---|---|
| `marketAddress` | `market` | `0xF0b865ebf18815C4f0B6f96D0356EB0E799c4BF7` |
| `receiverAddress` | `receiver` | `0x616C1D81570feb237cA7Dd148732929ED1787B94` |
| `feedAddress` | `feed` | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` (Chainlink ETH/USD, Base Sepolia) |

Other settings: `chainSelectorName` is `ethereum-testnet-sepolia-base-1` (chain id 84532). `maxDeviationBps` is 200. Setting `requireReference: false` lets the workflow settle on Chainlink alone if Coinbase is down.

## Forwarder addresses (Base Sepolia)

Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts (page last modified 2026-09-18). After login, `cre workflow supported-chains` prints the authoritative per-tenant list.

| Environment | Contract | Address |
|---|---|---|
| `cre workflow simulate --broadcast` | MockKeystoneForwarder | `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5` |
| Deployed workflow (production DON) | KeystoneForwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

The deployed `SettlementReceiver` currently has `forwarder() == 0x0000…0000`, which means it accepts reports from any sender. Simulation with `--broadcast` therefore works as it is. To lock it down, the owner calls `setForwarder`: the mock address while testing with `--broadcast`, the KeystoneForwarder once the workflow is deployed. Example (signs with your own wallet; never paste keys into files you commit):

```bash
cast send 0x616C1D81570feb237cA7Dd148732929ED1787B94 "setForwarder(address)" 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5 \
  --rpc-url https://sepolia.base.org --account <your-foundry-keystore-account>
```

## Install, build, test

Prerequisites: Bun 1.2.21 or later (the TS SDK compiles to WASM through Bun and Javy), and the CRE CLI.

```bash
# CRE CLI (official): https://docs.chain.link/cre/getting-started/cli-installation/macos-linux
curl -sSL https://app.chain.link/cre/install.sh | bash        # installs to ~/.cre
#   or, as done here: download the GitHub release and check its sha256
gh release download v1.39.0 -R smartcontractkit/cre-cli -p cre_darwin_arm64.zip -p checksums.txt
shasum -a 256 cre_darwin_arm64.zip && grep darwin_arm64 checksums.txt
unzip cre_darwin_arm64.zip && mv cre_v1.39.0_darwin_arm64 cre && chmod +x cre && xattr -c cre
# A verified v1.39.0 binary is already at cre/.bin/cre (gitignored).

cd cre/stance-settler
bun install            # or: npm install
bun run typecheck      # tsc --noEmit
bun test               # 6 unit tests on a fake chain
bun run build          # cre-compile main.ts dist/stance-settler.wasm

# The CLI build works without login too:
cd .. && ./.bin/cre workflow build stance-settler --target staging-settings   # → stance-settler/binary.wasm
```

## Simulate (needs a CRE account)

Both `cre init` and `cre workflow simulate` require authentication.

```bash
cd cre
./.bin/cre login               # opens a browser; or export CRE_API_KEY=... (from app.chain.link > Account Settings)
./.bin/cre whoami

# Dry run: reads Base Sepolia and Coinbase and prepares the report; nothing is sent
./.bin/cre workflow simulate stance-settler --non-interactive --trigger-index 0 --target staging-settings
```

For the onchain write, create `cre/.env` (it is gitignored) containing `CRE_ETH_PRIVATE_KEY=<64 hex chars, no 0x>` for a wallet funded with Base Sepolia ETH. Write this file yourself. Then:

```bash
./.bin/cre workflow simulate stance-settler --non-interactive --trigger-index 0 --target staging-settings --broadcast
```

The docs say the simulator may want `CRE_ETH_PRIVATE_KEY` present even for a dry run. If the dry run complains, add the `.env` first.

What to expect right now: all 32 registered ranges expire in the future (the earliest is 1794556800, 2026-11-13 08:00 UTC). A run today logs the range count, the latest Chainlink round, the Coinbase spot deviation and `nothing to settle`. After an expiry passes, the run logs the round search, the `[check] … OK` line, the report entries and the write (`0x000…` tx hash on a dry run, a real hash with `--broadcast`).

To demo a settlement before then, register a range with a near-term expiry (`contracts/script`), wait for the first feed round after it, and simulate with `--broadcast`.

## Deploy (optional)

Follow https://docs.chain.link/cre/guides/operations/deploying-workflows: `cre workflow deploy stance-settler --target production-settings`, after `cre account link-key`/registry setup as the docs describe. Point `SettlementReceiver.setForwarder` at the KeystoneForwarder `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`.
