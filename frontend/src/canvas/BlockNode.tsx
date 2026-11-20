// How one block looks on the canvas. React Flow positions it; we draw it.
// Phase 1: every block is a rough box. Per-category shapes come in Phase 5.
// Phase 2: the box shows live sim state: color by health, a utilization bar,
// a stack of boxes for queue depth, shaking when saturated, gray with a crack when killed.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { categoryColor, registry } from '../blocks'
import type { FlowNode } from '../design'
import { fmtPct, healthColor, healthOf, type Health } from '../display'
import { isDown, useSim } from '../simStore'
import { roughPath, roughRect, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export const BLOCK_W = 150
export const BLOCK_H = 72

const FILL: Record<Health, string> = { idle: '#FFFFFF', ok: '#FFFFFF', warn: '#FFF4E6', bad: '#FFE3E3', dead: '#F1F3F5' }

export function BlockNode({ id, data, selected }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const m = useSim((s) => s.sim.metrics[id])
  const down = useSim((s) => isDown(s.killed, id))
  const health = healthOf(m, down)

  // Redraw only when selection or health changes, so the wobble doesn't jitter.
  const shapes = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1.2 }
    const box = roughRect(BLOCK_W, BLOCK_H, {
      ...o, strokeWidth: selected || health === 'bad' ? 2.5 : 1.8, fillStyle: 'solid', fill: FILL[health],
      stroke: selected ? '#2F6FDE' : health === 'idle' || health === 'ok' ? '#1E1E1E' : healthColor[health],
    })
    const crack = roughPath('M 70 2 L 82 22 L 72 38 L 90 56 L 84 70', { ...o, stroke: '#495057', strokeWidth: 1.5 })
    return health === 'dead' ? [box, crack] : [box]
  }, [id, selected, health])

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
    <div className={`block-node block-node--${health}`} style={{ width: BLOCK_W, height: BLOCK_H }}>
      <svg width={BLOCK_W} height={BLOCK_H} className="block-node__bg"><RoughPaths drawables={shapes} /></svg>
      <div className="block-node__label">
        <span style={{ color: categoryColor(def.category) }}>{def.icon}</span> {def.label}
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
