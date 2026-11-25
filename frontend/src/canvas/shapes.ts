// One hand-drawn outline per block shape, so a design reads at a glance (docs/STYLE.md "Shapes").
// Every shape fits the fixed 150 × 72 block box. `body` options (fill, stroke) go on the
// outline; `mark` options on small extras (λ, a sparkle, partition lanes). The top-right
// corner is the gauge's and the top-left the logo sticker's, so marks sit bottom-right.
import type { Drawable, Options } from 'roughjs/bin/core'
import type { Shape } from '../blocks/types'
import { gen } from './rough'


export const SHAPES: Shape[] = ['box', 'lambda', 'sparkle', 'cloud', 'diamond', 'cylinder', 'bucket', 'pipe', 'lanes']

export function drawShape(shape: Shape, body: Options, mark: Options): Drawable[] {
  const faint = { ...mark, stroke: mark.stroke === 'none' ? 'none' : 'var(--ink-faint)', strokeWidth: 1 }
  const box = gen.rectangle(2, 2, 146, 68, body)
  const pipe = 'M 12 3 L 138 3 A 10 33 0 0 1 138 69 L 12 69 A 10 33 0 0 1 12 3 Z'
  switch (shape) {
    case 'lambda': return [box, gen.path('M 131 46 L 142 63 M 136.5 54.5 L 131 63', mark)]
    case 'sparkle': return [box, gen.path('M 137 44 Q 138 53 145 54 Q 138 55 137 64 Q 136 55 129 54 Q 136 53 137 44 Z', mark)]
    case 'cloud': return [gen.path('M 30 68 C 6 68 0 50 14 43 C 4 28 20 12 38 19 C 44 3 72 -1 84 13 C 98 1 126 6 125 24 C 146 22 152 48 136 56 C 144 68 126 70 116 68 Z', body)]
    case 'diamond': return [gen.path('M 2 36 L 26 2 L 124 2 L 148 36 L 124 70 L 26 70 Z', body)]
    case 'cylinder': return [gen.path('M 2 10 L 2 62 A 73 8 0 0 0 148 62 L 148 10', body), gen.ellipse(75, 9, 146, 12, body)]
    case 'bucket': return [gen.path('M 2 8 L 16 70 L 134 70 L 148 8 Z', body), gen.ellipse(75, 8, 146, 12, body)]
    case 'pipe': return [gen.path(pipe, body), gen.ellipse(138, 36, 20, 66, mark)]
    case 'lanes': return [gen.path(pipe, body), gen.ellipse(138, 36, 20, 66, mark),
      gen.path('M 14 25 L 126 25 M 14 47 L 126 47', { ...faint, strokeLineDash: [5, 5] })]
    default: return [box]
  }
}
