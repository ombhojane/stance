# Stance · ETHGlobal Mumbai 2026

> Type a sentence. Get a position.
> "I want to make $500 if ETH is above $3,000 by Nov 27."

Stance turns a plain-language price view into a fully-collateralized, cash-settled **spread** (UP/DOWN complete sets), priced and traded on **1inch Aqua**, settled by **Chainlink**, with a **Uniswap** TWAP guard. The receipt shows the odds bigger than the prize.

## Docs
- [docs/01-hackathon-research.md](docs/01-hackathon-research.md): event rules, sponsors, prior art, lessons
- [docs/02-product-spec.md](docs/02-product-spec.md): problem, mechanism, math, screens, sponsor mapping, pitch
- [docs/03-design-system.md](docs/03-design-system.md): references, tokens, components, copy rules

## App (UI prototype, static math)
```bash
cd app
npm install
npm run dev
```
Open http://localhost:3000. All prices and positions are simulated in the browser (demo clock fixed at Nov 6, 2026). Contracts come next.

### Screens
| Route | What it is |
|---|---|
| `/` | Landing: live sentence, "odds bigger than the prize", ramp vs binary, how it works, two doors |
| `/make` | The sentence composer: tap any word to edit it (stepper, asset cards, above/below, tick slider, dates with per-date odds), live quote bar |
| `/make/review` | The receipt: odds rings first, a draggable payoff ramp with the market's distribution, three plain outcomes, under the hood, slide to pay |
| `/make/done` | A ticket with confetti |
| `/positions` | Live and closed calls with mini ramps, live value and P/L |
| `/positions/[id]` | Live value, chance now vs at purchase, sell back (slide), **demo fast-forward to settlement**, settlement proof, collect |
| `/house` | Be the house: market, range, deposit, worst case as one number, and the inventory-skew pricing playground |
| `/signals` | Signals combo: agent confidence vs market odds, "Back this view" deep-links into `/make` |

### Demo script
1. `/make`: the default sentence is "Make $500 if ETH is above $3,000 by Nov 27". Tap the date to show odds change with time; flip to "below".
2. Review: odds first, drag the chart, tick the box, slide to pay.
3. Watch it → fast-forward → Chainlink settles → Collect.
4. `/house`: drag the inventory slider to show the SwapVM pricing idea.
5. `/signals`: Back this view → prefilled sentence.

Reset the demo wallet: clear `localStorage` key `stance.v1`.

### Code map
- `src/lib/market.ts`: the static market model (Black–Scholes spread pricing, sentence → position, odds). Mirrors `docs/02-product-spec.md` §4.
- `src/lib/store.tsx`: demo wallet, positions, vaults, toasts, simulated live prices (localStorage).
- `src/components/`: `PayoffRamp`, `RollingNumber`, `controls` (Stepper, TickSlider, SlideToConfirm, OddsRing, …).
