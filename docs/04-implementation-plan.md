# Stance: implementation plan

Decided Nov 6, 2026, 1am IST. Submission: Saturday Nov 7.

## Decisions
| Topic | Choice |
|---|---|
| Network | **Base Sepolia** live demo with the official Aqua code deployed by us (Aqua has no testnet deployment; its repo ships a testnet deploy script), plus **Base mainnet fork tests** against the real Aqua at `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` |
| Wallet | wagmi + viem: injected wallets + WalletConnect for phones |
| 1inch depth | Custom **AquaApp** first; then SwapVM pricing via the **Extruction** opcode if time allows |
| Toolchain | **Foundry** (installed via Homebrew, forge 1.9.0), solc 0.8.30 to match Aqua |
| Asset | ETH only, settled in USDC |

## Architecture
```
 PWA (Next.js + wagmi/viem)
   │ quote()/swap()
   ├──► SpreadAquaApp (inherits AquaApp)  prices UP/DOWN: fair value + inventory skew; pull()/push() on Aqua
   │ deposit/withdraw
   ├──► WriterVault ── ship()/dock() ──► Aqua registry (official code)
   │        │ mint/burn complete sets
   │        ▼
   │    SpreadSeries (per K1, K2, expiry): lock W USDC → 1 UP + 1 DOWN
   │ redeem   ▲ settle(roundId)
   └──────────┘
        Chainlink ETH/USD feed ◄── CRE workflow (cron → find expired series → settle report)
        Uniswap v3 WETH/USDC TWAP ◄── settlement guard (pause if > 1.5% apart)
```

## Contracts
1. **SpreadSeries**: `mint(n)` locks n·W USDC → n UP + n DOWN; `burn(n)` returns a complete set; `settle(roundId)` takes the first Chainlink round at/after expiry and checks the round before it is earlier (no cherry-picking), plus the TWAP guard; `redeem()` pays UP `clamp(S−K1,0,W)`, DOWN the rest. Always solvent.
2. **SpreadAquaApp**: an AquaApp following 1inch's `XYCSwap` example. `quote()` + `swapExactIn` for USDC↔UP and USDC↔DOWN. Price = Black–Scholes spread value (vol registry) + inventory skew from live Aqua virtual balances. Math: Solady `expWad`/`lnWad` + a normal-CDF approximation.
3. **WriterVault**: "Be the house". The contract is the Aqua maker: takes USDC, mints sets, ships UP and DOWN strategies, docks at expiry, redeems.
4. **SettlementReceiver**: receives CRE reports via `onReport()` → `settle()`.

## Sponsors
| Sponsor | Deliverable | Must-haves |
|---|---|---|
| 1inch Aqua ($5K) | Custom AquaApp + vault as maker (+ SwapVM Extruction, phase 2) | Official contracts, onchain transfers in demo, steady commits |
| Chainlink CRE ($1.5K) | TypeScript workflow: cron → read feed + series → write settlement report | `cre workflow simulate --broadcast` is enough |
| Uniswap ($10K pool) | v3 TWAP guard in settlement | `FEEDBACK.md`, feedback form, README pointers |

## Frontend
Replace simulated store actions with contract calls (quote = read, Take stance = approve + swap, sell back, redeem, deposit, withdraw). Live ETH price from Chainlink; positions read from chain. Keep the static math as an offline demo mode when no wallet is connected.

## Timeline (IST)
| When | What |
|---|---|
| Fri 1am–9am | Contracts + tests: series, AquaApp, vault, settlement |
| Fri 9am–1pm | Deploy to Base Sepolia, seed liquidity, Uniswap pool + TWAP |
| Fri 1pm–7pm | Wire the frontend |
| Fri 7pm–11pm | CRE workflow, end-to-end demo run |
| Sat early | FEEDBACK.md, README, video, submit |

## Needed from the team
- A Base Sepolia deployer key in `contracts/.env` (`DEPLOYER_PRIVATE_KEY`), set by you, plus faucet ETH and USDC.
- A WalletConnect project ID (`NEXT_PUBLIC_WC_PROJECT_ID`).
- Optional: an Etherscan v2 API key for contract verification.

## Commit rule
Plain commit messages, no Claude co-author lines.
