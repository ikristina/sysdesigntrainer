// A connection between two blocks, drawn as a hand-drawn curve with an arrowhead.
// React Flow gives us the start/end coordinates; getBezierPath turns them into an SVG curve.
// While the sim runs, dots flow along it (docs/STYLE.md "Edges"): the target block's flow color,
// denser and faster with more throughput. A failing edge (target dropping >1% or down, or cut)
// turns coral, line and dots, and coral dots fall off its end.
// An edge cut by a partitioned region gets a red ✕ in the middle. A routed edge shows a tag:
// 'reads' / 'writes' if it carries only one kind, '× followers' / '× following' if it fans out.
import { BaseEdge, getBezierPath, Position, useNodesData, type EdgeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { registry, toneOf } from '../blocks'
import type { FlowNode } from '../design'
import { isDown, useSimView } from '../simStore'
import type { EdgeRoute } from '../design'
import { gen, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

// Unit vector pointing out of the target block from the side the edge enters.
const OUT: Record<Position, [number, number]> = {
  [Position.Left]: [-1, 0], [Position.Right]: [1, 0], [Position.Top]: [0, -1], [Position.Bottom]: [0, 1],
}

export function RoughEdge(p: EdgeProps) {
  const [d, midX, midY] = getBezierPath(p)
  const { id, target, targetX: x, targetY: y } = p
  const [dx, dy] = OUT[p.targetPosition]
  const rps = useSimView((s) => s.sim.edges[id] ?? 0)
  const running = useSimView((s) => s.running)
  const m = useSimView((s) => s.sim.metrics[target])
  const down = useSimView((s) => isDown(s.killed, target, s.nodes))
  const isCut = useSimView((s) => s.sim.cut.includes(id))
  const failing = isCut || down || (!!m && m.lambda > 0 && m.dropped / m.lambda > 0.01)
  const targetDef = registry[useNodesData<FlowNode>(target)?.data.blockType ?? '']
  const tone = targetDef && toneOf(targetDef)
  const stroke = p.selected ? 'var(--violet)' : failing ? 'var(--coral)' : 'var(--ink)'
  const drawn = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1, strokeWidth: 2, stroke }
    // Arrowhead at the target, pointing into the block from whichever side the edge enters.
    const bx = x + dx * 10, by = y + dy * 10
    return [gen.path(d, o), gen.line(bx - dy * 6, by + dx * 6, x, y, o), gen.line(bx + dy * 6, by - dx * 6, x, y, o)]
  }, [id, d, x, y, dx, dy, stroke])

  const r = (p.data ?? {}) as EdgeRoute
  const fanTag = (r.fanout === 'write' ? 'writes × followers' : r.fanout === 'read' ? 'reads × following' : '') + (r.fanout && r.sequential ? ', in turn' : '')
  const tag = r.carries && r.carries !== r.fanout ? [`${r.carries}s only`, fanTag].filter(Boolean).join(' · ') : fanTag
  // Buckets, so the animation doesn't restart on every small change. Each gap + 2 divides 48,
  // the distance one animation cycle moves (index.css @keyframes dash), so the loop is seamless.
  const gap = rps < 100 ? 14 : rps < 10_000 ? 10 : 6
  const dur = failing ? 4 : rps < 100 ? 4 : rps < 10_000 ? 2 : 1

  return (
    <>
      <RoughPaths drawables={drawn} />
      {rps > 0.5 && (
        <path d={d} className={`edge-flow${running ? ' edge-flow--run' : ''}`}
          style={{ stroke: failing ? 'var(--coral)' : tone ? `var(--flow-${tone})` : 'var(--ink-muted)', strokeDasharray: `2 ${gap}`, animationDuration: `${dur}s` }} />
      )}
      {failing && running && [0, 0.4, 0.8].map((delay) => (
        <circle key={delay} cx={x + dx * 16} cy={y + dy * 16} r={3} className="edge-drop" style={{ animationDelay: `${delay}s` }} />
      ))}
      {isCut && <text x={midX} y={midY} className="edge-cut">✕</text>}
      {tag && <text x={midX} y={midY - 10} textAnchor="middle" className="edge-tag">{tag}</text>}
      {/* Invisible wide path so the edge is easy to click/select. */}
      <BaseEdge id={p.id} path={d} style={{ stroke: 'transparent' }} interactionWidth={16} />
    </>
  )
}
