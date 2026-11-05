# ETHGlobal Mumbai 2026: research notes

Compiled Nov 5, 2026 (hacking started 9pm IST that night). Sources at the bottom.

## The event

- **When / where:** Nov 5–7, 2026, Jio World Convention Centre, BKC, Mumbai. Part of Devcon week. About 36 hours of hacking.
- **Scale:** 800+ attendees, 12 sponsors, about $175K in prizes, 29+ workshops.
- **Team size:** 1–5. **Up to 3 sponsor prizes per project.**
- **Finalist prizes (per person):** solo $250; team of 2: $250 + $250 travel; team of 3–5: $1,000 + $500 travel. Plus a hoodie, $10K of AWS credits and an ETHGlobal Plus discount.
- **Judges and mentors include:** Vitalik Buterin, Justin Drake, Austin Griffith (EF), Kartik Talwar (ETHGlobal), Jordi Baylina, Tomasz Stanczak and Ben Adams (Nethermind), and Balaji Srinivasan at the opening.

### New this year: the Continuity Track
Three starting points are allowed:
1. **From scratch:** the classic empty repo.
2. **Extend open source:** bring a repo you maintain, or extend existing OSS.
3. **Ship a feature:** build one new feature on an existing product and open-source it.

Many sponsors have **Continuity-only prizes**, which draw fewer entrants. Only the new work is judged, so show a dated "before" commit and a changelog.

### Rules that bite
- Fully AI-built projects can lose eligibility. Disclose how you used AI.
- Most sponsors want **steady git history** (1inch explicitly: no single-commit uploads on the last day).
- Demo video of 2–5 minutes, a public repo and a README.
- Several sponsors require feedback files (`FEEDBACK.md`, `WHITECHAIN_FEEDBACK.md`, `/arkiv/friction.md`).

## Sponsors and what they want

| Sponsor | Pool | Core ask | Notes |
|---|---|---|---|
| **1inch** | $7K | **Aqua app implementing a "sophisticated DeFi position"**; custom SwapVM instructions score higher | $5K main (2.5/1.5/1K) + $2K continuity. Onchain token transfers in the demo (local forks OK). Real git history |
| **Uniswap Foundation** | $15K | Anything on the Uniswap stack (API, v2/v3/v4, hooks, CCA) | $10K main in 4 places (4/3/2/1K) + $5K continuity (4 × $1,250). Needs `FEEDBACK.md` + feedback form |
| **Chainlink** | $5K | CRE workflow ($1.5K) or CCIP 2.0 (2 × $1,750) | A CRE simulation is enough. CCIP must change state onchain |
| 0G | $15K | Consumer AI apps, physical AI, self-funding agents | No chat wrappers; "what breaks if 0G is removed" |
| Arc (Circle) | $15K | Must start in Arc Studio. DeFi with USDC, agent marketplaces, stablecoin contracts, Bridge Kit | 5 × $3K tracks |
| Hedera | $15K | x402 agent payments ($6.5K), tokenization studios ($5K), no-Solidity ($2K) | |
| Arkiv | $15K | Web3 database: mirror data, build on Arkiv, node tooling | Heavy required write-ups, so fewer entrants |
| Whitechain | $15K | USDT business payments, RWA lifecycles, gasless payments | Whitechain Sepolia, real test USDT |
| Ethereum Foundation | $15K | Anon-RPC, the EIP-8141 alt mempool, CROPS apps | One EF prize per project |
| World | $12.5K | World ID Agent Pass, IDKit: a meaningful human-verification moment | |
| ENS | $10K | ENSv2 central to the product | |
| Definitive | $5K | Social trading on Flash advanced orders | |

## Prior art and saturation (from the ETHGlobal showcase)

- **"Intent" is the most crowded word in the showcase**: 35+ projects across HackMoney 2026, Open Agents, ETHOnline 2026, Tokyo 2026, NY 2026 and others.
- **AI agent + spending limits + World ID approval** was everywhere at Tokyo 2026.
- **Options have been tried about 8 times**, with no known top-10 finalist.
- **Direct prior art for us:**
  - **AquaVol** (Tokyo 2026, same 1inch track): covered WETH calls; Black-Scholes and inventory skew in custom SwapVM instructions; Base Sepolia; a Uniswap V3 TWAP oracle. A pro options desk, not a consumer product.
  - **Aqua Outcome Market** (Buenos Aires): binary prediction-market AMM on Aqua.
  - **Aquapilot** (Lisbon 2026): "a sentence in, validated SwapVM bytecode out".
  - **OpSwap** (NY 2025, won a Uniswap v4 hooks prize): JIT options minted from a v4 hook.
  - **Thales Speed Markets** (live product): UP/DOWN at roughly 50/50 odds, minutes to hours.

## Why the original intent-options app didn't make the cut as-is
1. Built on Derive, which isn't a sponsor, so it's worth $0 in sponsor prizes.
2. A frontend over someone else's RFQ API is technically thin for finalist judges.
3. Bullish call spreads only, with no bearish view.
4. It led with "MAKE $3,000" and buried the 18% odds (lottery-ad framing).

What survives: **the sentence UX.** Turning a plain goal into a capped-risk position is a real usability gain.

## Lessons from adjacent products
- **DeFi option vaults (Ribbon, Friktion, Thetanuts):** retail *sold* volatility without understanding it. Yields collapsed with volatility, strikes were crowded, and losses came in rallies. Ribbon merged into Aevo; Friktion shut down. → Writers in our design must see their worst case as one number, and both sides must be capped.
- **Prediction markets (Polymarket, Kalshi):** won retail with *simple, defined-risk, self-settling* contracts. Short-dated options traders are the cohort moving there. Cboe is now trying to relaunch binaries to compete. → Copy the simplicity, but binaries are the wrong shape for price views.
- **DeFi UX research:** plain language over jargon ("most you can lose", not "max drawdown"); progressive disclosure; show key numbers without clutter.

## Sources
- https://ethglobal.com/events/mumbai/prizes/
- https://ethglobal.com/events/mumbai
- https://ethglobal.com/showcase (searches: option, intent, hedge, signal, aqua, outcome)
- https://ethglobal.com/showcase/aquavol-uyeam
- https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp
- https://business.1inch.com/portal/documentation/aqua/help/swapvm-faq
- https://members.delphidigital.io/learn/covered-calls
- https://medium.com/@benhwx/dovs-101-an-objective-look-at-option-vaults-676f1c07f4f2
- https://crypto.news/cboe-eyes-binary-options-reboot-to-rival-polymarkets-prediction-markets/
- https://www.blocmates.com/articles/thales-the-architecture-for-parimutuel-markets-and-derivatives
- https://ethglobal.com/events/cannes/info/details (general rules)
