// Renders rough.js drawables as React <path> elements. Colors go in style (not attributes) so var(--token) works.
import type { Drawable } from 'roughjs/bin/core'
import { gen } from './rough'

export function RoughPaths({ drawables }: { drawables: Drawable[] }) {
  return (
    <>
      {drawables.flatMap((d) => gen.toPaths(d)).map((p, i) => (
        <path key={i} d={p.d} style={{ stroke: p.stroke, strokeWidth: p.strokeWidth, fill: p.fill ?? 'none' }} />
      ))}
    </>
  )
}
