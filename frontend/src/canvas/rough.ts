// Hand-drawn look. rough.js turns a shape into wobbly SVG path strings; React renders them.
// A fixed seed per node keeps the wobble identical between renders (otherwise it jitters).
import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'

export const gen = rough.generator()

export function seedOf(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h) || 1
}

export const roughRect = (w: number, h: number, o: Options) => gen.rectangle(2, 2, w - 4, h - 4, o)
