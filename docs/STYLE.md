# Style guide: cute sketchbook

Hand-drawn canvas in pastel colors, with instrument-panel readouts (gauges, alert lights) drawn in the same hand-drawn style.
Reference mockups: `docs/mockups/StyleCute.dc.html` (scene under load) and `docs/mockups/Products.dc.html` (product blocks). They're design-tool sources: read them for values and structure, don't copy the markup.

## Principles
- Shape + fill color = what a block does (category). Logo = which product.
- Coral is reserved for "broken". Nothing decorative is coral.
- Quiet when healthy, loud only where something fails.
- Everything hand-drawn uses rough.js, not CSS tricks.

## Color tokens
| Token | Hex | Use |
|---|---|---|
| `paper` | `#FCFBFF` | app background, canvas |
| `ink` | `#3B3355` | strokes, text, logos (plum, not black) |
| `ink-muted` | `#6E6589` | secondary text, labels |
| `ink-faint` | `#A39BBF` | async/replication edges, disabled |
| `line-faint` | `#D9D3EA` | dividers, gauge track |
| `coral` | `#E8455A` | broken: saturated node stroke, failing edges, alarm text |
| `coral-text` | `#C92A3E` | coral used as text on light fills (contrast) |
| `amber` | `#F59F00` | warning (ρ ≥ 0.85), amber alert fill `#FFEC99` |
| `ok` | `#20C997` | healthy gauge |

Category fills (pastel):
| Category | Fill | Flow dot color |
|---|---|---|
| client | `#E5DBFF` lilac | `#F59F00` |
| traffic (LB, gateway) | `#FFF1B8` butter | `#748FFC` |
| compute (service, worker, fn) | `#D0EBFF` sky | `#748FFC` |
| cache | `#FFD6E7` pink | `#F783AC` |
| queue / stream | `#FFE8CC` peach | `#FFA94D` |
| relational DB | `#C3FAE8` mint | `#63E6BE` |
| NoSQL / search | `#D3F9D8` green | `#69DB7C` |
| AI (LLM, embeddings) | `#E3FAFC` aqua | `#3BC9DB` |
| saturated (any) | `#FFC9C9` + coral hachure | coral |

Check text contrast ≥ 4.5:1 on every fill. `ink` passes on all pastels above.

## Type
- One family: **Shantell Sans** (Google Fonts, 400/600/800).
- Scale: 11 (gauge values), 13 (labels, secondary), 15–16 (block labels), 18 (panel headings), 32 (readouts).
- Sentence case everywhere. No all-caps labels. No monospace.
- Numbers in readouts: weight 800.

## Shapes (rough.js)
roughness ~1.2, bowing ~1, strokeWidth 1.7 in `ink`, fill = category pastel with `fillStyle: 'solid'`.
Saturated node: stroke `coral`, `fillStyle: 'hachure'`, hachureAngle -45, hachureGap 6, fill coral at ~45% over `#FFC9C9`.
- client: rectangle
- LB / gateway: diamond
- service / worker / function: rectangle (function adds a small λ)
- cache: rectangle
- queue / stream: horizontal pipe (stream shows partition lanes)
- databases: cylinder (relational and NoSQL differ only by fill)
- blob: bucket
- LLM: rectangle with a small sparkle
- region / AZ: dashed rough rectangle, no fill, `ink-faint`, label top-left
Seed rough.js per node id so shapes don't re-wobble on every render.

## Gauges
Every node has a small 270° gauge at its top-right corner (~30px), white center, `line-faint` track.
Arc color: `ok` < 0.85 ≤ `amber` < 1.0 ≤ `coral`. Value (ρ, 2 decimals) under it, 11px weight 800, text colors `#0B7A5C` / `#B26B00` / `coral-text`.

## Edges
- rough.js curved line, `ink`, with a hand-drawn arrowhead.
- Flow: dots (dash `2 10`, width ~3) in the target category's flow color, moving along the path. Speed and density ∝ throughput.
- Failing edges: stroke and dots `coral`.
- Replication / async: `ink-faint`, dashed `4 6`, no dots.
- Dropped requests: coral dots that fall off the edge.
- Respect `prefers-reduced-motion`: stop dot animation, keep colors.

## Panels
- Readout cards (left): rough rectangle, pastel fill (p99 `#FFE3E3`, errors `#FFF3BF`, traffic `#E5DBFF`), label 13px `ink-muted`, value 32px weight 800. p99 value turns `coral-text` when over the target.
- Alert lights (bottom): rough pill per alert. Lit red = `#FFC9C9`, lit amber = `#FFEC99`, off = no fill, `#C9C2DD` stroke, `#8F87A8` text. Initial set: Primary saturated, Replica lag, Retry storm, Cache cold, Region down. Generated from sim state, not hardcoded.
- Annotations: Claude's `highlight()` renders as a coral handwritten note with a rough arrow, rotated -3°.

## Product logos
- Simple Icons (`simple-icons` npm), rendered in `ink`. Never full-color by default.
- Placement: inline left of the label in the palette and on small blocks; as a round white "sticker" (rough circle, rotated -8°) at a block's corner on the canvas.
- Selected or hovered block: logo switches to brand color (`#` + icon.hex), with a lilac selection ring `rgba(103,65,217,.35)`.
- No Simple Icons logo (AWS services, Memcached, Valkey): dashed circle with initials (Mc, SQS, DDB, S3). Don't draw look-alikes.
- Generic blocks show a small "generic" tag instead of a logo.
- README gets a note: logos via Simple Icons (CC0), marks belong to their owners.

## Themes
All values above live in one token file (CSS variables). Dark "instrument panel" theme can be added later by swapping tokens. Don't hardcode colors in components.
