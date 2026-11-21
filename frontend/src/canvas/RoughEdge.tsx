// A connection between two blocks, drawn as a hand-drawn curve with an arrowhead.
// React Flow gives us the start/end coordinates; getBezierPath turns them into an SVG curve.
// While the sim runs, moving dashes ("particles") flow along it: width by volume, speed by
// throughput, color by the target's health. Red dots fall off the end when the target fails requests.
// An edge cut by a partitioned region gets a red ✕ in the middle.
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { healthColor, healthOf } from '../display'
import { isDown, useSimView } from '../simStore'
import { roughLine, roughPath, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export function RoughEdge(p: EdgeProps) {
  const [d, midX, midY] = getBezierPath(p)
  const stroke = p.selected ? '#2F6FDE' : '#1E1E1E'
  const { id, target, targetX: x, targetY: y } = p
  const drawn = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1, strokeWidth: 2, stroke }
    // Targets are always on a block's left side, so the arrow always points right.
    return [roughPath(d, o), roughLine(x - 10, y - 6, x, y, o), roughLine(x - 10, y + 6, x, y, o)]
  }, [id, d, x, y, stroke])

  const rps = useSimView((s) => s.sim.edges[id] ?? 0)
  const running = useSimView((s) => s.running)
  const m = useSimView((s) => s.sim.metrics[target])
  const down = useSimView((s) => isDown(s.killed, target, s.nodes))
  const isCut = useSimView((s) => s.sim.cut.includes(id))
  const health = isCut ? 'bad' : healthOf(m, down)
  const failing = isCut || (m && m.lambda > 0 && m.dropped / m.lambda > 0.01)
  // Buckets, so the animation doesn't restart on every small change.
  const width = Math.round(Math.min(6, 1.5 + Math.max(0, Math.log10(rps) - 1)) * 2) / 2
  const dur = health === 'bad' || health === 'dead' ? 4 : rps < 100 ? 3 : rps < 10_000 ? 1 : 0.5

  return (
    <>
      <RoughPaths drawables={drawn} />
      {rps > 0.5 && (
        <path d={d} className={`edge-flow${running ? ' edge-flow--run' : ''}`}
          style={{ stroke: health === 'idle' ? healthColor.ok : healthColor[health], strokeWidth: width, animationDuration: `${dur}s` }} />
      )}
      {failing && running && [0, 0.4, 0.8].map((delay) => (
        <circle key={delay} cx={x - 16} cy={y} r={3} className="edge-drop" style={{ animationDelay: `${delay}s` }} />
      ))}
      {isCut && <text x={midX} y={midY} className="edge-cut">✕</text>}
      {/* Invisible wide path so the edge is easy to click/select. */}
      <BaseEdge id={p.id} path={d} style={{ stroke: 'transparent' }} interactionWidth={16} />
    </>
  )
}
