# Stance: product spec

> **Type a sentence. Get a position.**
> "I want to make **$500** if **ETH** is **above $3,000** by **Nov 27**."
> You see the cost, the most you can lose, and the real odds before you commit. That's it.

## 1. The problem

People have *price views*, not *option strategies*. "ETH will be above 3k by end of month" is how humans think. Every product that lets you act on that view fails retail in a different way:

| Today's option | Why it fails |
|---|---|
| **Spot / perps** | Spot ties up full capital; perps have liquidation, funding and unbounded downside in practice |
| **Options DEXs** (Derive, Aevo, Lyra) | A cockpit: chains, greeks, margin, RFQs. Retail never learns it |
| **Prediction markets** (Polymarket, Kalshi) | Binary step function: "above 3k" pays the same at $3,001 and at $5,000, and $2,999 pays zero. Wrong shape for a price view |
| **Option vaults** (Ribbon, Friktion) | Retail *sold* volatility without understanding it, then lost in rallies. Ribbon merged into Aevo; Friktion shut down |
| **The original intent-options app** | Right UX idea, but "MAKE $3,000" was the biggest thing on screen and the 18% odds were buried. A lottery ad |

## 2. The insight (first principles)

A price view has four slots: **asset · direction · target · date.**
The financial object that matches it exactly is a **cash-settled vertical spread** with a ramp payoff:

```
UP pays    = clamp(S − K1, 0, W)        W = K2 − K1 (the width)
DOWN pays  = W − clamp(S − K1, 0, W)
UP + DOWN  = W   (always)
```

**The lateral move: complete sets.** Lock W USDC and mint 1 UP + 1 DOWN. This is Polymarket's complete-set model with a **ramp instead of a step**.

- **Fully collateralized, always solvent.** No margin engine, no liquidations, no counterparty risk. The contract can't go underwater.
- **Both directions for free.** Bearish is just buying DOWN.
- **Both sides capped.** The buyer's max loss is what they paid. The writer's max loss is W minus the premium received.
- **About 6x more capital-efficient than covered calls** (AquaVol locks ~$2,575 of WETH per call; a $400-wide spread locks $400 of USDC).
- **Continuous secondary market.** The Aqua AMM quotes UP and DOWN anytime, so you can sell back before expiry. Polymarket mostly holds to resolution; Derive needs an RFQ.

## 3. Product principles

1. **Odds bigger than the prize.** The market-implied chance is the largest number on the receipt. Every receipt states three outcomes in plain words.
2. **No jargon in the main flow.** Never "strike", "premium", "greeks" or "IV". Say "target", "cost", "most you can lose", "chance".
3. **One sentence, one screen.** Everything is editable in place. No forms.
4. **Both sides sleep at night.** Buyer and writer each see a single worst-case number.
5. **Show, don't promise.** Settlement links to the oracle print. Every fill links to the explorer.

## 4. Sentence → position (the math)

Inputs: `amount P` (profit you want), `asset`, `direction`, `target T`, `date`.

**Above T** (buys UP):
- `K2 = T`, `K1 = min(round(spot to grid), T − grid)`
- `ask = fairUP × (1 + fee)`, with `fairUP = BS_call(K1) − BS_call(K2)` (r = 0)
- `units n = P / (W − ask)` → max profit is exactly P
- `cost = n × ask` (also the most you can lose)
- `breakeven = K1 + ask`
- `chance of full payout = P(S_T ≥ K2) = N(d2(K2))`
- `chance of any profit = P(S_T > breakeven)`

**Below T** (buys DOWN):
- `K1 = T`, `K2 = max(round(spot to grid), T + grid)`
- `askDown = (W − fairUP) × (1 + fee)`
- `n = P / (W − askDown)`, `breakeven = K2 − askDown`
- `chance of full payout = P(S_T ≤ K1) = N(−d2(K1))`

Lognormal, r = 0: `d2(X) = (ln(S/X) − σ²t/2) / (σ√t)`.

Demo constants (static, for the UI prototype): ETH $2,575 (σ 62%, grid $100), BTC $68,400 (σ 48%, grid $1,000), SOL $142 (σ 80%, grid $5). Fee 3%. Sell-back bid = fair × 0.97. Demo clock fixed at **Nov 6, 2026**.

## 5. Screens

| Route | Screen | Key moments |
|---|---|---|
| `/` | **Landing** | A live sentence playing itself; "we show the odds bigger than the prize"; how it works in 3 steps; two sides (Make a call / Be the house) |
| `/make` | **The Sentence** | Four editable slots: amount stepper, asset chips, above/below toggle, target tick-slider, date chips. A live quote footer with rolling numbers. Contextual nudges ("already above today, so this is cheap but pays little") |
| `/make/review` | **The Receipt** | The odds hero. A payoff ramp you can scrub ("what if ETH ends at $2,850?"). Three plain outcome rows. An acknowledgement checkbox. **Slide to confirm** |
| `/make/done` | **Ticket** | A celebration with a ticket-style card and the explorer link. Go to positions |
| `/positions` | **Your calls** | Cards with live value, P/L, countdown and a ramp mini-chart. Settled cards show Redeem |
| `/positions/[id]` | **Position** | Big live value, the ramp with a "now" marker, **Sell back** (slide), settlement proof once settled |
| `/house` | **Be the house** | Pick a series, deposit USDC, see the worst case as one number and estimated fees. Your vaults |
| `/signals` | **Signals** (combo) | Signal cards ("ETH > $3,000 by Nov 27 · 70% confidence") with **Back this view** → prefilled `/make` |

## 6. Sponsor mapping (max 3 picks)

| Sponsor | Integration | Prize |
|---|---|---|
| **1inch Aqua** (primary) | `SpreadSeries` mints complete sets; a custom **AquaApp** prices UP and DOWN (fair value plus inventory-aware skew from live Aqua virtual balances); a **writer vault as the maker** ships both sides from one balance (the docs' "contract as maker" recipe) | $5K main |
| **Chainlink** | Settlement reads the ETH/USD feed; a **CRE workflow** watches expiries and calls `settle()` | $1.5K CRE |
| **Uniswap** | v3/v4 **TWAP guard** (settlement pauses into a dispute window if Chainlink and the TWAP diverge) + **any-token entry** via the Uniswap API | $10K main (4 places) |

Deploy target: a Base mainnet fork against the real Aqua registry `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` and AquaSwapVMRouter v1.0.2 `0x111111338c5091e8440b67b168bae16a668ac0de`. Build against v1.0.2 exactly, not the swap-vm main branch.

## 7. Architecture (target)

```
 User ── Next.js app ──quote() staticcall──► SpreadAquaApp ──safeBalances/pull/push──► Aqua registry
                    └─swap()─────────────────►      │                                     ▲
                                                    ▼                                     │ ship()
                                             SpreadSeries (mint/redeem/settle) ◄── WriterVault (maker)
                                                    ▲
                     Chainlink feed + CRE workflow ─┘   (Uniswap TWAP guard)
```

## 8. How we differ from prior art

| Prior | What it did | Stance |
|---|---|---|
| AquaVol (Tokyo '26, same 1inch track) | Covered WETH calls, Black-Scholes pricing in SwapVM | Cash-settled **spreads** (~6x capital efficiency), **complete sets** (two-sided, bearish included), the sentence UX, auto-settlement |
| Aqua Outcome Market | Binary outcome AMM | A **ramp**, the right shape for price views |
| Thales Speed Markets | UP/DOWN coin flips | Targets, dates, "make $X" sizing, odds-first receipt |
| Derive intent-options | The sentence over Derive RFQ | Fully onchain, two-directional, odds-first, sell back anytime |

## 9. The Signals combo (say it, keep it small)
A signal card says "ETH > $3,000 by Nov 27 · 70% confidence", with a **Back this view, risk capped** button that deep-links to `/make?asset=ETH&dir=above&target=3000&date=2026-11-27`. In the pitch: "Next: accountable signals feed one-click capped-risk execution."

## 10. Pitch storyline (3 minutes)
1. **Hook (15s):** "Polymarket proved people want simple bets with known risk. But a price isn't yes/no."
2. **Problem (30s):** the four broken options, plus the lottery-ad screenshot.
3. **Demo (90s):** type the sentence → receipt with the odds first → slide to confirm → onchain fill on the fork → fast-forward → settle via Chainlink → redeem. Flip to "below" to show bearish works too.
4. **How (30s):** complete sets, Aqua writer vault, inventory-aware pricing, CRE settlement.
5. **Close (15s):** "We show the odds bigger than the prize."

## 11. Risks and honest notes
- Black-Scholes in Solidity is the main cliff. Fallback: a bounded fair-value curve plus inventory skew. Solvency comes from the complete-set design, not the pricing.
- Aqua SDK version mismatch: pin router v1.0.2.
- Vol input is a registry value set by the operator in the MVP. Say so in the README.
- Regulatory: cash-settled derivatives on testnet / fork only. Odds-first framing is deliberate.

## 12. Build plan (36h)
| Window | Deliverable |
|---|---|
| Thu night | This doc + **UI prototype with static math** (this repo, `app/`) |
| Fri morning | `SpreadSeries` + Foundry tests on a Base fork |
| Fri afternoon | Custom AquaApp: ship / quote / swap against the real registry on the fork |
| Fri evening | Wire the UI to contracts, Chainlink settle + CRE, Uniswap TWAP guard |
| Sat morning | `FEEDBACK.md`, README, 3-minute video, submission |
