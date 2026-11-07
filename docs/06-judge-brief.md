# Stance: the judge brief

Everything about the product in one place: what it is, how it works, how each piece is built and why, the regulatory picture, and the questions judges are likely to ask. Numbers come from the deployed contracts and the live app.

---

## 1. The 30-second pitch

> "Ninety-three percent of individual options traders in India lost money over three years. Most weren't wrong about the market; the product beat them: time decay, volatility crush, margin calls.
>
> Stance lets you trade what you think happens next, in one sentence: *I want to make $500 if ETH ends above $3,000 by Nov 27.* You see three numbers before you pay: what you pay, what you make, and your odds. What you pay is the most you can ever lose. The payout is locked in the contract the moment you trade, and Chainlink settles it on the date.
>
> And the house, the side that wins on average, is a vault anyone can deposit into."

**One line:** prediction-market simplicity, options-market substance, and the house seat is open to everyone.

---

## 2. The problem

| Fact | Source |
|---|---|
| 93% of individual equity F&O traders in India lost money, FY22 to FY24 | [SEBI press release 37/2024, 23 Sep 2024](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html) |
| Aggregate individual losses above ₹1.8 lakh crore; average loss about ₹2 lakh per trader | same study |
| Prop desks and foreign investors made gross profits in the same period, mostly through algorithmic trading | same study, [press coverage](https://www.outlookbusiness.com/markets/fo-frenzy-over-93-retail-investors-lost-average-rs-2-lakh-in-three-years-says-sebi) |
| US retail lost about $358k per day on same-day (0DTE) S&P options; ~60% of it was transaction costs | Beckmeyer, Branger & Gayda (2023), [summary](https://www.wealthmanagement.com/equities/retail-investors-are-love-same-day-options) |

**Why people lose, even when they're right:**
1. **Time decay.** An option loses value every day you hold it.
2. **Volatility crush.** After an event, the option's price collapses even if the stock moved your way.
3. **Margin calls and liquidations.** Losses aren't capped; you can lose more than you put in.
4. **Complexity.** Strikes, Greeks, chains. Retail can't price what it's buying.

**The two existing alternatives both fall short:**
- **Options (Zerodha F&O, Deribit, onchain options):** honest instrument, but a maths exam, with uncapped risk for sellers.
- **Prediction markets (Polymarket, Kalshi, Probo):** simple, but binary: yes/no, one bit, no "how much", and the other side is just another gambler.

**Onchain options died for a different reason:** liquidity split across every strike and expiry, sellers had to lock full collateral for tiny returns, and LPs got picked off by oracle lag ([analysis](https://www.decentralised.co/p/perps-will-eat-options)). Stance fixes this with 1inch Aqua's shared liquidity (section 5).

---

## 3. How it works for the user

1. **Type a sentence.** "I want to make **$500** if ETH ends **above** **$3,000** on **Nov 27**." Every coloured word is a control: amount, direction, target, date. Smart defaults are already filled in.
2. **See three numbers.** You pay about $193. You make $500 if right. Your odds (about 10%). There's a receipt chip on the odds showing which model produced them.
3. **Review like a bet slip.** "Out of 100 ways this could end: 13 pay you in full, 21 pay part, 66 lose what you paid." A payoff ramp shows what you get at every price. You tick a box that spells out your loss ("If ETH is at or below $2,600 on Nov 27, I lose the $193 I paid").
4. **Slide to pay.** One transaction (plus a one-time approve).
5. **On the date,** Chainlink's price settles it and you redeem. You can also sell back early at the live bid.

**Two modes:** **Prod** runs on the live Base Sepolia contracts with a wallet and Test USD from the faucet. **Test** is the same app in the browser with $10,000 of play money, so a judge can try every screen without a wallet. Share it with `stance.omisaur.app/?mode=test`.

---

## 4. The mechanism (the part to understand cold)

### Complete sets: why it can never go insolvent
Each market is a **range**, for example $2,600 to $3,000. Its **width** W is $400.

- Lock **W = $400** of USDC and you get **1 UP + 1 DOWN** token. That pair is a "complete set".
- At settlement, at ETH price S:
  - **UP pays** `clamp(S − K1, 0, W)`: $0 below $2,600, rising $1 per $1 up to $400 at $3,000 or above.
  - **DOWN pays** `W − UP`.
- **UP + DOWN = W, always.** Every dollar that can ever be paid out was locked when the set was minted. There is no scenario where winners can't be paid. No margin, no liquidation, no counterparty risk.

"Make $500 if ETH ends above $3,000" means **buy UP on the $2,600 to $3,000 range**. "Below" means buy DOWN.

### Worked example (the numbers in the video)
- Range $2,600 to $3,000, W = $400. Ask ≈ $111.40 per UP unit.
- You want $500 profit. Edge per unit = $400 − $111.40 = $288.60. Units = 500 ÷ 288.60 ≈ **1.73**.
- **You pay** 1.73 × $111.40 ≈ **$193**. **Max payout** 1.73 × $400 ≈ **$693** (your $193 back + $500).
- **Breakeven** = K1 + ask = **$2,712**.

| ETH on Nov 27 | You get | Net |
|---|---|---|
| ≤ $2,600 | $0 | −$193 (max loss) |
| $2,712 | $193 | $0 |
| $2,800 | $346 | +$153 |
| ≥ $3,000 | $693 | +$500 |

It's a **call spread** in options language: linear between the strikes, capped at both ends. Unlike a binary bet, being *nearly* right still pays.

### Pricing
- **Fair value** = Black-Scholes call spread (r = 0): `C(S,K1) − C(S,K2)`. The same maths runs in Solidity (`SpreadMath`, Abramowitz-Stegun normal CDF) and in TypeScript, so the app and the contract agree.
- **Ask** = fair × (1 + 3% fee) + an **inventory skew** of up to +30% when one side has mostly sold out (`SKEW_BPS = 3000`). Floor at 0.4% of width, cap at 99%.
- **Bid** (sell back early) is fair minus the spread.
- Trading stops **5 minutes before expiry** (`CUTOFF`), so nobody trades against a nearly known outcome.

### The house (WriterVault)
- Anyone deposits USDC into a range's vault and gets vault shares.
- The vault mints **60%** of deposits into complete sets (`MINT_BPS = 6000`) and keeps **40%** as USDC reserve.
- It sells UP and DOWN to traders at ask, and earns the **3% fee**.
- **Balanced flow:** UP and DOWN sales offset, the vault holds both sides of the sold sets, and keeps the fees.
- **One-sided flow:** the vault holds the other side to expiry. **Worst case is bounded by the deposit:** every set is fully backed, so an LP can never owe more than it put in.
- **Skew self-balances the book:** as UP sells out, UP gets more expensive and DOWN cheaper, attracting the other side without an external hedger.

---

## 5. Tech stack: what, where, and why

### Smart contracts (Solidity 0.8.30, Foundry, Base Sepolia)

| Contract | What it does |
|---|---|
| `SpreadSeries` | One range: `mint` / `burn` complete sets, `settle(roundId)`, `redeem`. Holds all collateral. |
| `OutcomeToken` | The ERC-20 UP and DOWN tokens (18 decimals) minted by a series. |
| `SpreadMath` | Onchain Black-Scholes: `normCdf`, `callPrice`, `fairUp`, `chanceAbove`. |
| `SpreadAquaApp` | Our **1inch Aqua app**: quotes and fills UP/DOWN at fair + fee + skew. |
| `WriterVault` | The house. Aqua maker for one range; ships UP and DOWN strategies on one shared reserve. |
| `StanceMarket` | Registry of all ranges (series + vault). Started as a factory; became a registry because the factory exceeded the 24 KB contract size limit. |
| `SettlementReceiver` | Receives Chainlink CRE reports and calls `settle`. |
| `UniswapV3TwapGuard` | Optional second-opinion price check at settlement. |
| `TestUSD` | Test stablecoin with a faucet (10,000 per hour). |

**Tests:** 28 Foundry tests, including 2 **fork tests against the real Base deployments** of Aqua, the Chainlink feed, USDC and the WETH/USDC Uniswap pool. 6 tests for the CRE workflow. Contracts are verified on Basescan.

**Deployment:** 32 live ranges (8 ranges × 4 dates: Nov 13, Nov 27, Dec 25, Mar 26), each seeded with 25,000 Test USD by a house vault.

### 1inch Aqua: pricing and shared liquidity
- **What:** Aqua lets a maker keep funds in its own wallet or vault and "ship" strategies against them. Takers trade against the strategy; Aqua tracks what's committed.
- **How we use it:** `SpreadAquaApp` is a custom AquaApp, not a fork of an example. Each `WriterVault` is the maker and **ships two strategies, UP and DOWN, against the same USDC reserve**. Full lifecycle: `ship`, `dock`, `pull`, `push`, `safeBalances`.
- **Why:** this solves the reason onchain options died. Before, every strike and every side needed its own pool, so liquidity fragmented. With Aqua, **one reserve backs both directions**. Capital stays in the vault, and Aqua stops it being double-spent.

### Chainlink: the price and the settlement
- **Price feed:** ETH/USD on Base Sepolia (`0x4aDC…7cb1`). Used live in the app and onchain for quotes, with a staleness guard (`maxPriceAge` = 1 day).
- **Settlement rule (enforced onchain):** the settlement round must be the **first Chainlink round at or after expiry**, the previous round must be **before** expiry, and it must be within **1 day** of expiry (`MAX_SETTLEMENT_DELAY`). The contract checks this itself, so nobody can settle with a convenient price.
- **Chainlink CRE workflow (`cre/stance-settler`, TypeScript):** runs every 10 minutes. It reads all ranges from `StanceMarket`, finds expired ones, **searches the feed's round history through Multicall3** for the correct settlement round, **cross-checks the price against Coinbase** (must be within 2%), simulates, then sends a report to `SettlementReceiver`, which calls `settle`.
- **Why:** calling `latestRoundData()` at expiry is a classic bug, because it returns whatever is current when the transaction lands, not the price at expiry. The round search is what makes settlement correct, and the contract re-verifies it.
- **Settlement is permissionless.** Anyone can call `settle(roundId)` with the right round. CRE is the automation, not a trusted party.

### 0G: the odds, with receipts
- **What:** "the desk". The server gathers live context (Chainlink spot, 7-day and 30-day realized volatility from Binance price history, 24h and 7d moves, perp funding rate). One inference call returns a **volatility for each expiry**, a bias, a confidence score and a plain-English read. The app prices the odds with that volatility through the same Black-Scholes.
- **Model:** `0gm-1.0-35b-a3b`, **0G's own model, running inside an Intel TDX enclave (TeeML)**, called through the 0G Compute Router.
- **The receipt:** every read carries a **request ID**, the **TEE provider address**, and **"signature verified ✓"**. We don't just trust the Router: our server uses 0G's SDK (`processResponse`) to check the enclave's signature on that exact output against the provider registered on **0G Chain**.
- **Speed:** reads are cached for 5 minutes with stale-while-revalidate, so users never wait. Verification runs in the background. Model latency is about 2.5s, and users never see it.
- **Safety rails:** strict JSON schema, volatilities clamped to 25% to 160%, neighbouring expiries can't differ by more than 6 points, a 30s hard deadline, OpenAI fallback (the chip then shows "ai"), and a static fallback.
- **Where it shows:** the receipt chip on the hero, the "desk read" line on the review page, and the live desk card on Signals.
- **What breaks without 0G:** "Remove 0G and our odds fall back to a stale historical constant with no proof of where the number came from."
- ⚠️ **Before judging:** the live desk runs on OpenAI to save 0G credits. Run `cd app && npm run desk:0g` (about 30 seconds), then check the chip says **0G**. Run `npm run desk:openai` afterwards.

### Uniswap: second-opinion guard (built, not entered)
`UniswapV3TwapGuard` reads the WETH/USDC pool's 30-minute TWAP through `observe()`, converts ticks to a price onchain, and compares it with Chainlink's settlement price (1.5% tolerance). On Base Sepolia the pool trades about 21% off real ETH because nobody arbitrages it, so the guard runs in **monitor mode** on testnet and would enforce on mainnet. Uniswap asked us not to enter their track because we use 1inch, but the guard stays in as defence in depth.

### App and infrastructure
- **Next.js 16** (Turbopack), React 19, Tailwind v4, motion. **wagmi v3 + viem** for the chain. A PWA you can install, with all routes prerendered and prefetched.
- **Test/Prod switch** (`lib/mode.tsx`) as described in section 3.
- **Hosting:** Google Cloud Run (Docker, standalone Next build, non-root container) behind a global HTTPS load balancer with a Google-managed certificate at `stance.omisaur.app`.
- **Secrets:** API keys live in env vars and are never committed. The private keys stay in an encrypted Foundry keystore.

---

## 6. Trust properties, plain

1. **Solvent by construction.** UP + DOWN = W, fully collateralized at mint.
2. **Max loss is known before you pay,** and you acknowledge it in writing.
3. **No margin, no liquidation, no leverage.**
4. **Settlement isn't ours.** Chainlink's round is checked onchain, and anyone can trigger it.
5. **Odds have receipts.** TEE-verified inference on 0G.
6. **The house is public.** Anyone can deposit into a vault and earn the spread.
7. **Everything is verifiable onchain.** Collateral, sets, fills and settlement.

---

## 7. Honest limitations (say them before they're asked)

- **Testnet only.** Base Sepolia with Test USD, not real money.
- **Onchain pricing uses a fixed volatility.** The contract's Black-Scholes uses a constant; the 0G desk sets the odds you *see* and the Signals read. Next step: push the desk's volatility onchain as an attested update.
- **Ranges are pre-made.** 8 per date, so your target snaps to the nearest live range.
- **One oracle for settlement.** Chainlink, with the Coinbase cross-check in CRE and the TWAP guard as backstops.
- **No external audit yet.** 28 tests including fork tests, but not audited.
- **The vault can lose in one-sided markets.** Bounded by the deposit, but LPs carry real risk, as any market maker does.
- **ETH only for now.**

---

## 8. Compliance and regulatory posture

> Not legal advice: this is the posture to state, and the frame regulators use.

### What the product is, legally
Economically, Stance is a **cash-settled, fully-collateralized call (or put) spread on ETH/USD**: a derivative on a market price. It is **not a binary bet on an event**. The payoff is linear between the strikes, it's priced with an options model, and the reference is an observable market price, not an opinion about a news event.

### Design choices that already line up with what regulators want
Regulators restrict retail derivatives because of **leverage, uncapped losses, opaque pricing and counterparty risk**. Stance removes each by design:
- **No leverage, no margin calls, no liquidations.** The maximum loss is the premium, shown and acknowledged before the trade. This is like built-in negative-balance protection.
- **Fully collateralized.** No credit or counterparty risk; reserves are provable onchain at any time.
- **Transparent pricing.** Fair value, fee and skew are all public, and the odds carry an inference receipt.
- **Deterministic, independent settlement** by an oracle, verified onchain.
- **A full audit trail** of every mint, fill and settlement, onchain.

### By jurisdiction

| Where | The rule | What Stance does |
|---|---|---|
| **India: crypto** | Crypto isn't banned, but has no derivatives framework. VDA service providers must **register with FIU-IND under PMLA** (KYC, record-keeping, suspicious-transaction reports), with active blocking of unregistered offshore platforms ([source](https://crypto.news/indias-fiu-ind-puts-crypto-under-full-aml-scope-with-strict-kyc-rules/)). Tax: 30% on VDA gains (Sec 115BBH) plus 1% TDS (Sec 194S). | A regulated front-end would register with FIU-IND, do KYC, and withhold TDS. |
| **India: gaming** | The **Online Gaming Act 2025** bans online money games. Rules took effect on 1 May 2026. Probo and MPL Opinio (opinion trading) shut down ([source](https://www.storyboard18.com/amp/gaming-news/after-probo-mpl-opinio-shuts-down-as-gaming-bill-also-targets-opinion-trading-79369.htm)). | **The biggest India risk.** Our position: Stance is a financial derivative on a market price, not a game. Honest launch posture: **no Indian retail launch until the line between VDA derivatives and online money games is clear.** |
| **United States** | Event contracts and commodity options fall under the **CFTC**. Retail access needs a registered exchange (DCM). Kalshi is a DCM; Polymarket returned to the US by buying one. The CFTC proposed new prediction-market rules in June 2026 ([source](https://www.everycrsreport.com/files/2026-06-24_LSB11441_b1797929d9c973e7d2962416b42af20eddfea3e4.html)). | Geofence US users. The US path is partnering with, or becoming, a DCM, the same route Polymarket took. |
| **United Kingdom** | The FCA has **banned crypto derivatives for retail** since January 2021 ([source](https://fca.org.uk/news/press-releases/fca-bans-sale-crypto-derivatives-retail-consumers)). | Geofence UK retail. Professional clients only. |
| **European Union** | MiCA does **not** cover derivatives; crypto derivatives are MiFID II financial instruments that need an investment-firm licence. ESMA restricts binary options for retail. | We're not a binary option (linear, capped spread). An EU launch goes through a MiFID-licensed partner. |
| **UAE** | Dubai (VARA) and Abu Dhabi (ADGM) license virtual-asset venues, including derivatives activity. *(Confirm current scope before quoting.)* | The most likely **first licensed launch** jurisdiction. |

### Controls a production launch would add
- **KYC and AML** through an onboarding provider, plus **Travel Rule** compliance on transfers.
- **Sanctions screening** (OFAC, UN, EU) at the front-end, plus an optional allowlist hook on deposit and buy.
- **Geofencing** for restricted jurisdictions.
- **An appropriateness check** before first trade, and **risk disclosures** (the "I lose $X" acknowledgement is already a key-information step).
- **Responsible-trading limits:** daily caps and cooling-off.
- **An external smart-contract audit,** a bug bounty, and documented oracle governance.

### The one-sentence feasibility answer
> "The protocol stays permissionless and fully collateralized. Access goes through regulated front-ends, with KYC and geofencing, in licensed jurisdictions. The UAE first; the US through a DCM partner, the way Polymarket did; India once the law separates VDA derivatives from online money games. And our design (no leverage, max loss known upfront, fully backed) is exactly what regulators have been asking retail derivatives to look like."

---

## 9. Business model
- **Takers** pay a **3% spread** on every trade. It goes to **vault depositors** today.
- **Protocol revenue** (production): a share of that spread, for example 10 to 20% of the fee, taken at the vault level.
- **Later:** licensed front-ends pay to plug into the liquidity (B2B), and markets on other assets (BTC, SOL, indices, FX) reuse the same contracts.

---

## 10. Competition, and why we're different

| Venue | What it is | How Stance differs |
|---|---|---|
| Polymarket, Kalshi, Probo | Binary yes/no event markets | We price **how far**, not just yes/no. Near-misses still pay. Odds come from an options model with receipts. |
| Deribit, Derive (ex-Lyra), Aevo | Professional options venues | No chains, no Greeks, no margin. A sentence, three numbers, max loss known. |
| Opyn, Ribbon, Lyra v1 | Onchain options that struggled | Aqua's **shared liquidity** removes the per-strike fragmentation that sank them. Complete sets remove seller insolvency. |
| AquaVol (Tokyo '26 hackathon) | Closest prior art on Aqua | Spreads instead of vanillas, complete sets, both directions on one reserve, the sentence UX, TEE-priced odds. |

---

## 11. Q&A bank

### Product
**Q: In one line, what is Stance?**
A: Type what you think ETH will do by a date, see what you pay, what you make and your odds, and the most you can lose is what you pay.

**Q: Who is it for?**
A: The person who has a view but not $2,500 to buy a whole ETH, and shouldn't need to decode an options chain. And depositors who want to be the house.

**Q: Isn't this just Polymarket?**
A: Polymarket is yes/no. Ours is a range: being nearly right still pays something, and you choose how much you want to make. The odds come from an options model, not a crowd vote, and they come with a TEE receipt.

**Q: Isn't this just options?**
A: Underneath, yes: a fully-collateralized call spread. What's new is that you never see an option. No strikes, no Greeks, no margin. And the seller side is a public vault, not a prop desk.

**Q: Why not just buy ETH?**
A: $2,500 for one ETH, with unlimited downside if it falls. With Stance, $193 expresses a view on the same move, the loss is capped at $193, and it pays $693 if you're right.

### Mechanism
**Q: How can you guarantee the payout?**
A: Complete sets. Every $400 of possible payout is locked as USDC when the UP and DOWN pair is minted. UP + DOWN = $400 always, so the money to pay every winner exists before any trade happens.

**Q: Where do the strikes come from?**
A: Each date has 8 pre-deployed ranges around spot. Your target snaps to the nearest live range, and the app tells you when it does.

**Q: What if ETH ends between the strikes?**
A: You get paid partially and linearly. At $2,800 on the $2,600 to $3,000 range you get half the width, $200 per unit.

**Q: Can I exit early?**
A: Yes. Sell back to the vault at the live bid (fair value minus the spread) any time until 5 minutes before expiry.

**Q: Why a 5-minute cutoff?**
A: Near expiry the outcome is almost known, and the oracle lags the market by seconds. The cutoff stops people trading against a stale price.

### Pricing and the house
**Q: How do you price it?**
A: Black-Scholes for a call spread, run onchain in `SpreadMath`, plus a 3% fee and an inventory skew. The app runs identical maths.

**Q: Who is the counterparty?**
A: The house vault for that range. Anyone can deposit; it sells both sides and earns the fee.

**Q: Can the vault go bankrupt?**
A: No. It can only lose what was deposited, because everything it sells is fully backed. One-sided flow can make it lose money, which is the risk depositors take for the fee.

**Q: What stops the vault from being drained by informed traders?**
A: The 3% spread, the inventory skew (the busy side gets more expensive), the 5-minute cutoff, and the price-staleness guard.

**Q: How much do depositors earn?**
A: The fee on volume: 3% of what traders pay. The House page shows an estimate at current demand and states that it isn't guaranteed.

### Oracles and settlement
**Q: What if Chainlink is wrong or late?**
A: The contract only accepts the first round at or after expiry, whose previous round is before expiry, within a day. CRE cross-checks against Coinbase and won't settle if they disagree by more than 2%. The Uniswap TWAP guard is a third check (monitor-only on testnet).

**Q: Who triggers settlement?**
A: Anyone can call `settle(roundId)`; it's permissionless. Chainlink CRE automates it every 10 minutes, so in practice nobody has to.

**Q: Why not use `latestRoundData` at expiry?**
A: It returns whatever round is current when the transaction lands, not the price at expiry. That's a well-known bug. We search the round history for the exact round.

### 0G
**Q: What does 0G actually do here?**
A: It produces the market read that sets the volatility, and so the odds you see. It runs on 0G's own model inside a TEE, and every read has a request ID and a verified enclave signature.

**Q: Why does an AI belong in pricing?**
A: Black-Scholes has exactly one input nobody can observe: volatility. Everything else (spot, strike, time) is known. Volatility is a judgment, and judgment is what inference is for. The receipt makes that judgment auditable.

**Q: Can't you just make up the number?**
A: No, that's the point of the receipt. We check the enclave's signature on the exact output against the provider registered on 0G Chain.

**Q: Is the onchain price using 0G?**
A: Not yet. The contract uses a fixed volatility; 0G sets the odds you see and the Signals read. The next step is an attested volatility update onchain.

**Q: What if 0G is down?**
A: OpenAI fallback (the chip changes to "ai"), then a static fallback. Reads are cached, so users never wait.

### 1inch Aqua
**Q: Why Aqua and not a normal AMM pool?**
A: Options fragment liquidity: every strike and side wants its own pool. With Aqua, the vault keeps one USDC reserve and ships UP and DOWN strategies on it, so the same capital backs both directions.

**Q: What's custom?**
A: `SpreadAquaApp`: our own AquaApp with onchain Black-Scholes, fee and skew. And `WriterVault`, which manages ship and dock and reships when liquidity changes.

### Security
**Q: Is it audited?**
A: Not externally. 28 Foundry tests, including fork tests against the real Base Aqua, Chainlink, USDC and Uniswap contracts. An audit comes before any mainnet launch.

**Q: Is there an admin key?**
A: The series and vaults have no upgrade path. Ranges are registered by the deployer. Settlement accepts reports from the configured CRE forwarder, but `settle` itself is permissionless with the round check.

### Compliance and business
**Q: Isn't this gambling? India just banned opinion trading.**
A: Opinion trading bets on events with yes/no answers. Stance is a cash-settled derivative on a market price with a linear payoff, priced by an options model and fully collateralized. That said, we'd not launch to Indian retail until the line between VDA derivatives and online money games is clear. Our first licensed market would be the UAE.

**Q: How would this be legal anywhere?**
A: The protocol stays permissionless; regulated front-ends add KYC, geofencing and an appropriateness check in licensed jurisdictions. The US goes through a registered exchange, as Kalshi does and as Polymarket did by acquiring one.

**Q: How do you make money?**
A: Takers pay a 3% spread, which goes to depositors today. In production the protocol takes a share of that fee.

**Q: What's next?**
A: An attested onchain volatility from the 0G desk, an audit, mainnet on Base with real USDC, more assets, and the first licensed front-end.

---

## 12. Cheat sheet

| | |
|---|---|
| Live app | `stance.omisaur.app` (no-wallet demo: `?mode=test`) |
| Chain | Base Sepolia (84532) |
| Ranges | 32 (8 per date × 4 dates) |
| Fee | 3% (`FEE_BPS 300`) |
| Inventory skew | up to +30% (`SKEW_BPS 3000`) |
| Vault split | 60% sets / 40% USDC reserve |
| Trading cutoff | 5 minutes before expiry |
| Settlement window | first round at or after expiry, within 1 day |
| CRE | every 10 minutes; Coinbase cross-check ≤ 2% |
| TWAP guard | 30-minute window, 1.5% tolerance, monitor-only on testnet |
| 0G model | `0gm-1.0-35b-a3b` (TeeML, Intel TDX) |
| Tests | 28 Foundry (2 fork) + 6 CRE |

**Addresses (Base Sepolia):** app `0xA108…C9AC` · Aqua `0xa2Fa…6381` · market `0xF0b8…4BF7` · Test USD `0x106f…44ff` · guard `0x5234…e9Ca` · receiver `0x616C…7B94` · ETH/USD feed `0x4aDC…7cb1`. Full list in `contracts/deployments/84532.json`.
