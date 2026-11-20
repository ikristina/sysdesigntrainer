// A connection between two blocks, drawn as a hand-drawn curve with an arrowhead.
// React Flow gives us the start/end coordinates; getBezierPath turns them into an SVG curve.
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { roughLine, roughPath, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export function RoughEdge(p: EdgeProps) {
  const [d] = getBezierPath(p)
  const stroke = p.selected ? '#2F6FDE' : '#1E1E1E'
  const { id, targetX: x, targetY: y } = p
  const drawn = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1, strokeWidth: 2, stroke }
    // Targets are always on a block's left side, so the arrow always points right.
    return [roughPath(d, o), roughLine(x - 10, y - 6, x, y, o), roughLine(x - 10, y + 6, x, y, o)]
  }, [id, d, x, y, stroke])
  return (
    <>
      <RoughPaths drawables={drawn} />
      {/* Invisible wide path so the edge is easy to click/select. */}
      <BaseEdge id={p.id} path={d} style={{ stroke: 'transparent' }} interactionWidth={16} />
    </>
  )
}
