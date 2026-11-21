// One hand-drawn outline per block shape, so a design reads at a glance (docs/SPEC.md "Shapes").
// Every shape fits the fixed 150 × 72 block box. `body` options (fill, health color) go on the
// outline; `mark` options on small extras (a lightning bolt, partition lanes, pins).
import type { Options } from 'roughjs/bin/core'
import type { Drawable } from 'roughjs/bin/core'
import type { Shape } from '../blocks/types'
import { gen } from './rough'

const path = (d: string, o: Options) => gen.path(d, o)

export function drawShape(shape: Shape, body: Options, mark: Options): Drawable[] {
  const faint = { ...mark, stroke: 'var(--ink-faint)', strokeWidth: 1 }
  const rounded = 'M 14 2 L 136 2 Q 148 2 148 14 L 148 58 Q 148 70 136 70 L 14 70 Q 2 70 2 58 L 2 14 Q 2 2 14 2 Z'
  const pipe = 'M 12 3 L 138 3 A 10 33 0 0 1 138 69 L 12 69 A 10 33 0 0 1 12 3 Z'
  const cylinder = (bands: number) => [
    path('M 2 10 L 2 62 A 73 8 0 0 0 148 62 L 148 10', body),
    gen.ellipse(75, 9, 146, 12, body),
    ...[48, 56].slice(0, bands).map((y) => path(`M 2 ${y} A 73 8 0 0 0 148 ${y}`, faint)),
  ]
  switch (shape) {
    case 'rounded': return [path(rounded, body)]
    case 'lambda': return [path(rounded, body), path('M 129 8 L 141 26 M 135 17 L 129 26', mark)]
    case 'monitor': return [gen.rectangle(2, 2, 146, 58, body), path('M 66 60 L 62 70 M 84 60 L 88 70 M 52 70 L 98 70', mark)]
    case 'cloud': return [path('M 30 68 C 6 68 0 50 14 43 C 4 28 20 12 38 19 C 44 3 72 -1 84 13 C 98 1 126 6 125 24 C 146 22 152 48 136 56 C 144 68 126 70 116 68 Z', body)]
    case 'diamond': return [path('M 2 36 L 26 2 L 124 2 L 148 36 L 124 70 L 26 70 Z', body)]
    case 'cylinder': return cylinder(0)
    case 'cylinder1': return cylinder(1)
    case 'cylinder2': return cylinder(2)
    case 'bucket': return [path('M 2 8 L 16 70 L 134 70 L 148 8 Z', body), gen.ellipse(75, 8, 146, 12, body)]
    case 'cache': return [gen.rectangle(2, 2, 146, 68, body), path('M 141 6 L 132 19 L 141 19 L 133 32', { ...mark, stroke: 'var(--flow-cache)' })]
    case 'pipe': return [path(pipe, body), gen.ellipse(138, 36, 20, 66, mark)]
    case 'lanes': return [path(pipe, body), gen.ellipse(138, 36, 20, 66, mark),
      path('M 14 25 L 126 25 M 14 47 L 126 47', { ...faint, strokeLineDash: [5, 5] })]
    case 'chip': return [gen.rectangle(10, 8, 130, 56, body),
      path([30, 55, 80, 105, 125].map((x) => `M ${x} 2 L ${x} 8 M ${x} 64 L ${x} 70`).join(' '), mark),
      path('M 146 -2 L 146 12 M 139 5 L 153 5', { ...mark, stroke: 'var(--flow-ai)' })]
    default: return [gen.rectangle(2, 2, 146, 68, body)]
  }
}
