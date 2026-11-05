# Stance contracts

Stance turns a sentence like "make $500 if ETH goes above $3,000 by Nov 27" into a position. Under the hood each position is a fully backed, cash-settled ETH **vertical spread** sold as **complete sets**: lock `W = K2 − K1` USDC and receive 1 UP + 1 DOWN. At expiry UP pays `clamp(S − K1, 0, W)` and DOWN pays the rest, so **UP + DOWN always equals the collateral**. The contract can never owe more than it holds: no margin, no liquidations. A 1inch Aqua app quotes UP and DOWN continuously against a "house" vault, Chainlink settles, and a Uniswap v3 TWAP acts as a second opinion on the settlement price.

Built for ETHGlobal Mumbai 2026. Solidity 0.8.30, Foundry. The frontend lives in `../app`, the Chainlink CRE workflow in [`../cre`](../cre).

## Architecture

```
  Trader (app/)                                House depositor
     │ buy / sell (USDC <-> UP|DOWN)              │ deposit / withdraw
     ▼                                            ▼
 ┌──────────────────┐  pull / push      ┌───────────────────┐
 │  SpreadAquaApp   │ ────────────────► │  Aqua (AquaRouter)│ ◄── ship / dock ──┐
 │  (AquaApp)       │  safeBalances     └───────────────────┘                   │
 │  fair value +    │                                                  ┌────────┴────────┐
 │  inventory skew  │                                                  │   WriterVault   │
 └───────┬──────────┘                                                  │  (Aqua maker:   │
         │ spot                                                        │  UP + DOWN on   │
         ▼                                                             │  one USDC pool) │
 ┌──────────────────┐   settle(roundId)   ┌──────────────────┐ mint/   └────────┬────────┘
 │ Chainlink ETH/USD│ ◄────────────────── │   SpreadSeries   │ ◄─redeem─────────┘
 └──────────────────┘                     │ (K1, K2, expiry) │
                                          │  UP / DOWN tokens│
 ┌──────────────────┐   check(price)      └────────┬─────────┘
 │UniswapV3TwapGuard│ ◄───────────────────────────┘ ▲
 │ (v3 observe())   │                               │ settle + vault.close()
 └──────────────────┘                     ┌─────────┴─────────┐
                                          │ SettlementReceiver│ ◄── Chainlink CRE (../cre)
                                          └───────────────────┘
 StanceMarket: registry of (series, vault) ranges that the app reads.
```

## Contracts and Base Sepolia deployment

Chain 84532. Addresses from [`deployments/84532.json`](deployments/84532.json).

| Contract | Role | Address |
|---|---|---|
| `SpreadSeries` | One range (K1, K2, expiry). Mints/burns complete sets, settles from Chainlink, redeems | 32 instances, listed by `StanceMarket.allRanges()` |
| `OutcomeToken` | UP or DOWN ERC-20; only its series can mint/burn | 2 per series |
| `SpreadMath` (lib) | Black–Scholes (r = 0) spread value with Solady `expWad`/`lnWad` and an A&S normal CDF; mirrors `app/src/lib/market.ts` | library |
| `SpreadAquaApp` | 1inch AquaApp: prices UP/DOWN, `buy`/`sell` via Aqua pull/push | [`0xA1085bf16cd72e4AE8EBf8238CD6FBf48048c9AC`](https://sepolia.basescan.org/address/0xA1085bf16cd72e4AE8EBf8238CD6FBf48048c9AC) |
| `WriterVault` | "Be the house": pooled USDC, mints sets, is the Aqua maker for both sides | 1 per series (via `StanceMarket`) |
| `StanceMarket` | Registry of (series, vault) ranges | [`0xF0b865ebf18815C4f0B6f96D0356EB0E799c4BF7`](https://sepolia.basescan.org/address/0xF0b865ebf18815C4f0B6f96D0356EB0E799c4BF7) |
| `UniswapV3TwapGuard` | 30-min TWAP second opinion on the settlement price | [`0x5234f46121A8a44a86e1EF020BdD97D4CaDBe9Ca`](https://sepolia.basescan.org/address/0x5234f46121A8a44a86e1EF020BdD97D4CaDBe9Ca) |
| `SettlementReceiver` | Chainlink CRE consumer: `onReport` settles series and closes vaults | [`0x616C1D81570feb237cA7Dd148732929ED1787B94`](https://sepolia.basescan.org/address/0x616C1D81570feb237cA7Dd148732929ED1787B94) |
| `TestUSD` | 6-decimal test dollar with a public faucet (10,000 per hour) | [`0x106f0B7C54f8E2Bfd5A204b37874DFada7F044ff`](https://sepolia.basescan.org/address/0x106f0B7C54f8E2Bfd5A204b37874DFada7F044ff) |
| Aqua `AquaRouter` | Official 1inch Aqua code (`lib/aqua`, tag v1.0.1), deployed by us | [`0xa2FaF9D614861B483b5D97BA850591b2328c6381`](https://sepolia.basescan.org/address/0xa2FaF9D614861B483b5D97BA850591b2328c6381) |
| Chainlink ETH/USD | Price feed (Chainlink's Base Sepolia deployment) | [`0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`](https://sepolia.basescan.org/address/0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1) |

Deployer: [`0x7b54B0d444aAE2717F05589212928E1e108fD79A`](https://sepolia.basescan.org/address/0x7b54B0d444aAE2717F05589212928E1e108fD79A).

**Live state.** 32 ranges are registered in `StanceMarket`: 8 per expiry (4 above spot, 4 below, at ±5/10/20/35%) for Nov 13, Nov 27, Dec 25 2026 and Mar 26 2027 (08:00 UTC). Each range's vault is seeded with 25,000 test USD.

**About the Aqua address.** 1inch has no Aqua deployment on Base Sepolia, so `Deploy.s.sol` deploys the official `AquaRouter` contract from `lib/aqua` (tag v1.0.1, unmodified) ourselves. The mainnet fork tests run against 1inch's real deployment at `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` on Base.

## Where to look, per sponsor

### 1inch Aqua

| What | Where |
|---|---|
| Custom AquaApp subclass | [`src/SpreadAquaApp.sol:21`](src/SpreadAquaApp.sol#L21) |
| Fair value from Chainlink spot + Black–Scholes spread | `fairUnit` [`src/SpreadAquaApp.sol:87-97`](src/SpreadAquaApp.sol#L87-L97), math in [`src/lib/SpreadMath.sol:59-66`](src/lib/SpreadMath.sol#L59-L66) |
| Inventory skew from live Aqua virtual balances (`AQUA.safeBalances`) | `prices` [`src/SpreadAquaApp.sol:100-115`](src/SpreadAquaApp.sol#L100-L115), balance read at line 104 |
| Direct-transfer swap: `pull` outcome to taker, then `push` USDC in (no taker callback, plain wallets work) | `buy` [`src/SpreadAquaApp.sol:130-148`](src/SpreadAquaApp.sol#L130-L148), pull/push at lines 143-146 |
| Sell-back: `pull` USDC, `push` outcome | `sell` [`src/SpreadAquaApp.sol:151-169`](src/SpreadAquaApp.sol#L151-L169), pull/push at lines 164-167 |
| Per-strategy reentrancy guard from `AquaApp` | `nonReentrantStrategy` at [`src/SpreadAquaApp.sol:132`](src/SpreadAquaApp.sol#L132) and [`:153`](src/SpreadAquaApp.sol#L153) |
| Vault as Aqua maker: approvals to Aqua, tokens never leave except by Aqua pulls | [`src/WriterVault.sol:56-59`](src/WriterVault.sol#L56-L59) |
| Two strategies (UP, DOWN) shipped against **one shared USDC reserve** | `_reship` [`src/WriterVault.sol:136-148`](src/WriterVault.sol#L136-L148), ships at lines 145-146 |
| Dock + ship with a fresh salt on every deposit (Aqua strategies are immutable) | `_dockAll` [`src/WriterVault.sol:150-157`](src/WriterVault.sol#L150-L157), called from `_reship` (line 137) and `close` (line 114) |
| Deposit → mint sets (60%) + keep USDC reserve (40%) → reship | `deposit` [`src/WriterVault.sol:94-108`](src/WriterVault.sol#L94-L108) |
| Against the real Aqua on Base mainnet: house deposit, buy, sell back | [`test/fork/BaseFork.t.sol:48-70`](test/fork/BaseFork.t.sol#L48-L70) |

### Chainlink

| What | Where |
|---|---|
| Feed read for pricing, with staleness check | `spot` [`src/SpreadAquaApp.sol:80-84`](src/SpreadAquaApp.sol#L80-L84) |
| Settlement round validation: round must be at/after expiry and within 1 day; previous round must be before expiry (no cherry-picking a later print) | `settle` [`src/SpreadSeries.sol:123-147`](src/SpreadSeries.sol#L123-L147), checks at lines 127-133 |
| CRE consumer: `onReport` decodes `(series[], vaults[], roundIds[])`, settles each and closes its vault; one bad entry does not block the batch | [`src/SettlementReceiver.sol:36-52`](src/SettlementReceiver.sol#L36-L52) |
| CRE workflow (cron → find expired ranges → report) | [`../cre/`](../cre) |

`settle` is permissionless and validates its own input, so the forwarder check in `onReport` (line 37) only stops spam. If `CRE_FORWARDER` is unset at deploy time the receiver accepts reports from anyone; the owner can set it later with `setForwarder`.

### Uniswap

| What | Where |
|---|---|
| TWAP from a v3 pool's `observe()` | `twapPrice` [`src/UniswapV3TwapGuard.sol:51-67`](src/UniswapV3TwapGuard.sol#L51-L67), `observe` at line 55 |
| Tick → price (`1.0001^tick` via `expWad(tick · ln 1.0001)`), token order and decimals | [`src/UniswapV3TwapGuard.sol:56-66`](src/UniswapV3TwapGuard.sol#L56-L66) |
| Tolerance check and `enforce` flag | `check` [`src/UniswapV3TwapGuard.sol:69-73`](src/UniswapV3TwapGuard.sol#L69-L73) |
| Guard is consulted inside settlement; a disagreement reverts with `GuardRejected` | [`src/SpreadSeries.sol:136-141`](src/SpreadSeries.sol#L136-L141) |
| Base Sepolia: monitor-only (`enforce = false`) | [`script/Deploy.s.sol:65-66`](script/Deploy.s.sol#L65-L66) |
| Base mainnet fork: enforced at 1.5% against the real WETH/USDC 0.05% pool | [`test/fork/BaseFork.t.sol:85-96`](test/fork/BaseFork.t.sol#L85-L96) |

Why monitor-only on testnet: the Base Sepolia WETH/USDC 0.3% pool is thin and mispriced. Its 30-minute TWAP read about $1,786 against Chainlink's ~$2,262, roughly 21% apart (a re-check on Nov 6 gave $1,781 vs $2,246), so an enforced guard would block every settlement. On a Base mainnet fork the guard runs with `enforce = true` and 1.5% tolerance: in our run Chainlink and the 30-minute TWAP agreed within 0.4%, and a print 10% off Chainlink was refused.

## Build and test

```shell
forge build
forge test                                    # 26 unit tests (series, math, Aqua app, vault)
forge test --match-path "test/fork/*" --fork-url https://mainnet.base.org
```

The fork tests skip themselves unless the chain id is 8453. They use the real 1inch Aqua (`0x1111113C…6a90a`), Chainlink ETH/USD (`0x71041ddd…16Bb70`), USDC (`0x833589fC…02913`) and the Uniswap v3 WETH/USDC 0.05% pool (`0xd0b53D92…F224`) on Base.

## Deploy (Base Sepolia)

```shell
cp .env.example .env    # set DEPLOYER_ADDRESS; optional CRE_FORWARDER, SEED_PER_VAULT
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast --slow \
  --account <keystore-name> --sender <address>
```

The script deploys TestUSD, AquaRouter, SpreadAquaApp, the TWAP guard (monitor-only), StanceMarket and SettlementReceiver, then 8 ranges per expiry, each with a seeded vault, and writes `deployments/84532.json`.

Safety guards in [`script/Deploy.s.sol:49-52`](script/Deploy.s.sol#L49-L52):
- It refuses to run on any chain other than Base Sepolia (84532).
- `DEPLOYER_ADDRESS` must be set, and the signer must match it.

An encrypted Foundry keystore (`--account`) is the recommended signer. A raw `DEPLOYER_PRIVATE_KEY` in `.env` also works. See [`.env.example`](.env.example); never commit `.env`.

## Security notes and known limitations

- **Not audited.** Hackathon code.
- **Volatility is owner-set.** `SpreadAquaApp.vol` (62% at deploy) comes from `setVol`, not from a market or oracle. Bad vol means bad prices for traders or the house, but it cannot make a series insolvent: solvency comes from complete sets, not from pricing.
- **Test dollar on testnet.** Base Sepolia uses `TestUSD` with a public faucet, not real USDC. The owner can mint it. The mainnet fork tests use real USDC.
- **TWAP guard is monitor-only on testnet** (see above). Settlement there relies on the Chainlink round checks alone.
- **Shared Aqua reserve.** Both of a vault's strategies are shipped against the same USDC balance, so Aqua's virtual balances add up to more USDC than the vault holds. If traders on both sides sell back enough to drain that USDC, a later sell-back's `pull` reverts until more USDC arrives (new buys or deposits). Buys are not affected.
- **Settlement depends on the feed.** The settling round must be the first one at or after expiry, and it must be reported within 1 day of expiry (`MAX_SETTLEMENT_DELAY`). If the feed stopped updating for more than a day across an expiry, that series could not settle and there is no admin fallback. Once a valid round exists, anyone can call `settle` with it at any later time.
- **Pricing uses spot only.** Quotes use Chainlink's latest answer (max age 1 day) with no circuit breaker beyond that staleness check.
- **Vault deposits are locked until settlement**, and trading stops 5 minutes before expiry.
