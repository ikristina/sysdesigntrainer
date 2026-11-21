// How one block looks on the canvas. React Flow positions it; we draw it.
// Phase 5: each block has a shape (cylinder for databases, diamond for load balancers...), see shapes.ts.
// Phase 2: the box shows live sim state: color by health, a utilization bar,
// a stack of boxes for queue depth, shaking when saturated, gray with a crack when killed.
// Phase 3: a blue glow when Claude (or an explainer) highlights it.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { registry } from '../blocks'
import type { FlowNode } from '../design'
import { fmtPct, healthColor, healthOf, type Health } from '../display'
import { isDown, useSimView } from '../simStore'
import { roughPath, seedOf } from './rough'
import { Mark } from './Mark'
import { drawShape } from './shapes'
import { RoughPaths } from './RoughPaths'

export const BLOCK_W = 150
export const BLOCK_H = 72

const FILL: Record<Health, string> = { idle: '#FFFFFF', ok: '#FFFFFF', warn: '#FFF4E6', bad: '#FFE3E3', dead: '#F1F3F5' }

export function BlockNode({ id, data, selected }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const m = useSimView((s) => s.sim.metrics[id])
  const down = useSimView((s) => isDown(s.killed, id, s.nodes))
  const health = healthOf(m, down)
  const lit = useSimView((s) => s.highlight.ids.includes(id))

  // Redraw only when selection or health changes, so the wobble doesn't jitter.
  const shapes = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1.2 }
    const stroke = selected ? '#2F6FDE' : health === 'idle' || health === 'ok' ? '#1E1E1E' : healthColor[health]
    const outline = drawShape(def.shape ?? 'box',
      { ...o, strokeWidth: selected || health === 'bad' ? 2.5 : 1.8, fillStyle: 'solid', fill: FILL[health], stroke },
      { ...o, strokeWidth: 1.5, stroke })
    const crack = roughPath('M 70 2 L 82 22 L 72 38 L 90 56 L 84 70', { ...o, stroke: '#495057', strokeWidth: 1.5 })
    return health === 'dead' ? [...outline, crack] : outline
  }, [id, selected, health, def.shape])

  const replicas = data.params.replicas ?? data.params.read_replicas
  const stats = health === 'dead' ? 'down'
    : m && m.lambda > 0 ? [
      Number.isFinite(m.mu) ? `ρ ${m.rho.toFixed(2)}` : '',
      m.dropped / m.lambda > 0.005 ? `${fmtPct((100 * m.dropped) / m.lambda)} err` : '',
      m.note ?? '',
    ].filter(Boolean).join(' · ') : ''
  const boxes = m && (def.simBehavior === 'queue' || def.simBehavior === 'stream')
    ? Math.min(10, Math.ceil(Math.log10(1 + m.queue) * 2)) : 0

  return (
    <div className={`block-node block-node--${health} shape--${def.shape ?? 'box'}${lit ? ' block-node--lit' : ''}`} style={{ width: BLOCK_W, height: BLOCK_H }}>
      <svg width={BLOCK_W} height={BLOCK_H} className="block-node__bg"><RoughPaths drawables={shapes} /></svg>
      <div className="block-node__label">
        <Mark def={def} /> {def.label}
      </div>
      {replicas !== undefined && (
        <div className="block-node__sub">
          {data.params.read_replicas !== undefined ? `+${replicas} read replicas` : `×${replicas}`}
        </div>
      )}
      {stats && <div className="block-node__stats" style={{ color: healthColor[health] }}>{stats}</div>}
      {m && m.lambda > 0 && Number.isFinite(m.mu) && health !== 'dead' && (
        <div className="util"><div style={{ width: `${Math.min(100, m.rho * 100)}%`, background: healthColor[health] }} /></div>
      )}
      {boxes > 0 && (
        <div className="qstack" aria-label={`${Math.round(m!.queue)} waiting`}>
          {Array.from({ length: boxes }, (_, i) => <span key={i} />)}
        </div>
      )}
      {/* Connection points: drag from the right dot of one block to the left dot of another. */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
