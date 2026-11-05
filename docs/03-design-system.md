# Stance: design system

## References
- **bencho.dev**: interactive React micro-interactions. Borrowed: **slide to confirm**, **rolling counter**, **tick slider**, **stepper (− 95 +)**, **toast stack**, **dot-matrix** textures, **tilt card**. Dark canvas, soft #161618 tiles, large radii, pill buttons, tactile feedback.
- **Pinterest** ("playful minimal fintech", "prediction market app ui", "neo-brutalist web3"): Wise-style lime accent on dark; Polymarket-style yes/no pills with chance rings; neo-brutalist chunky type for the hero only.

## Direction (v2): "the price landscape"
- **The hero *is* the product.** Like a travel site's search bar docked on a destination photo, the composer (asset tabs → up/down tabs → Make · If above · By · Costs · Take stance) docks on a full-bleed visual.
- **The visual is the math.** An animated ASCII cone draws every price the market thinks is possible between today and your date. Cells where you'd win glow lime; a few sample journeys fly from today toward your flag; the flag carries your target and the chance. **Drag the flag** to move your target.
- **Dithered 1-bit illustrations** (generated with `gpt-image-1.5`, converted to transparent ink) for doors, empty states and page headers. They invert for dark mode.
- **Anti-slop rules:** no feature grids, no paragraphs explaining the product, no fake testimonials. One headline, one interaction, numbers that mean something. Labels are 1–3 words; captions are mono and tiny.
- **Light and dark** are both first-class (`data-theme` on `<html>`, a toggle in the nav, system default, no flash).

## Direction (v1): "tactile calm"
Dark, quiet, rounded. One playful accent per meaning. Big sentence typography is the hero; everything else stays out of its way. Motion is springy and short.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | canvas |
| `--tile` | `#151517` | cards |
| `--tile-2` | `#1D1D20` | raised controls |
| `--line` | `#26262A` | hairlines |
| `--ink` | `#F4F3EF` | primary text |
| `--mute` | `#8B8A91` | secondary text |
| `--up` | `#C8F560` | UP / profit / primary CTA (lime) |
| `--down` | `#FF8A7A` | DOWN / loss (coral) |
| `--odds` | `#B9A6FF` | chance / probability (lilac) |
| `--sun` | `#FFD66B` | highlights, celebration |

Radii: 28px tiles, 999px pills, 14px inputs. Spacing on a 4px grid.

## Type
- **Inter Tight** for UI and numbers (tabular figures for anything that changes).
- **Instrument Serif italic** for the playful words in the sentence ("if", "by", "then") and section accents.

## Components
- `SentenceSlot`: an inline editable chip inside the sentence; underlined dotted, accent on focus, with a popover editor.
- `Stepper`: − value + with long-press acceleration.
- `TickSlider`: a row of ticks; the active ticks light up; the value rolls.
- `RollingNumber`: digit-by-digit spring roll.
- `OddsRing`: a circular chance meter (lilac).
- `PayoffRamp`: an SVG ramp with up/down fills, K1/K2/breakeven markers, a draggable "ends at" scrubber, and a "now" marker.
- `SlideToConfirm`: a drag thumb that fills the track; snaps back below 90%.
- `Ticket`: a perforated receipt card for the done screen.
- `Toast`: a stacked toast for fills and settlements.

## Copy rules
- "cost" not "premium"; "target" not "strike"; "chance" not "probability"; "most you can lose" not "max loss".
- Every money number has a $ and no more than 2 decimals; big numbers are rounded.
- Odds are always shown with the word "chance" and the source: "market says".
