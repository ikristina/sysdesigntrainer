// Renders rough.js drawables as React <path> elements.
import type { Drawable } from 'roughjs/bin/core'
import { gen } from './rough'

export function RoughPaths({ drawables }: { drawables: Drawable[] }) {
  return (
    <>
      {drawables.flatMap((d) => gen.toPaths(d)).map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} />
      ))}
    </>
  )
}
