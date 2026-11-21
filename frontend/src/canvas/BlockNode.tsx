// How one block looks on the canvas (docs/STYLE.md). React Flow positions it; we draw it.
// Shape + pastel fill = what the block does (its tone, blocks/index.ts toneOf). Live sim state:
// a ρ gauge at the top-right, coral stroke with coral hachure when saturated or failing,
// a stack of boxes for queue depth, faint with a crack when killed, a glow when Claude highlights it.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { hasPresets, registry, toneOf } from '../blocks'
import type { FlowNode } from '../design'
import { fmtPct, healthColor, healthOf } from '../display'
import { isDown, useSimView } from '../simStore'
import { Gauge } from './Gauge'
import { gen, roughPath, seedOf } from './rough'
import { Mark } from './Mark'
import { drawShape } from './shapes'
import { RoughPaths } from './RoughPaths'

export const BLOCK_W = 150
export const BLOCK_H = 72

export function BlockNode({ id, data }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const m = useSimView((s) => s.sim.metrics[id])
  const down = useSimView((s) => isDown(s.killed, id, s.nodes))
  const health = healthOf(m, down)
  const lit = useSimView((s) => s.highlight.ids.includes(id))
  const shape = def.shape ?? 'box'

  // Redraw only when health changes, so the wobble doesn't jitter. Same seed = same wobble.
  const drawn = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1.2, bowing: 1 }
    const mark = { ...o, strokeWidth: 1.4, stroke: 'var(--ink)' }
    if (health === 'dead') {
      return [...drawShape(shape, { ...o, strokeWidth: 1.7, stroke: 'var(--ink-faint)', fill: 'var(--fill-dead)', fillStyle: 'solid' }, { ...mark, stroke: 'var(--ink-faint)' }),
        roughPath('M 70 2 L 82 22 L 72 38 L 90 56 L 84 70', { ...o, stroke: 'var(--ink-muted)', strokeWidth: 1.5 })]
    }
    if (health === 'bad') {
      // Pink base with the outline, then coral hachure over it (no outline, so the stroke isn't doubled).
      return [...drawShape(shape, { ...o, strokeWidth: 2, stroke: 'var(--coral)', fill: 'var(--fill-hot)', fillStyle: 'solid' }, { ...mark, stroke: 'var(--coral)' }),
        ...drawShape(shape, { ...o, stroke: 'none', fill: 'var(--hachure)', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 6, fillWeight: 1.6 }, { stroke: 'none' })]
    }
    const tone = toneOf(def)
    return drawShape(shape, { ...o, strokeWidth: 1.7, stroke: 'var(--ink)', fill: tone ? `var(--fill-${tone})` : 'var(--panel)', fillStyle: 'solid' }, mark)
  }, [id, health, shape, def])

  const badge = !!def.product?.badge
  const sticker = useMemo(() => [gen.circle(15, 15, 26, {
    seed: seedOf(id), roughness: 1, strokeWidth: 1.3, stroke: 'var(--ink)', fill: 'var(--panel)', fillStyle: 'solid', strokeLineDash: badge ? [3, 3] : undefined,
  })], [id, badge])

  const replicas = data.params.replicas ?? data.params.read_replicas
  const stats = health === 'dead' ? 'down'
    : m && m.lambda > 0 ? [
      m.dropped / m.lambda > 0.005 ? `${fmtPct((100 * m.dropped) / m.lambda)} err` : '',
      m.note ?? '',
    ].filter(Boolean).join(' · ') : ''
  const boxes = m && (def.simBehavior === 'queue' || def.simBehavior === 'stream')
    ? Math.min(10, Math.ceil(Math.log10(1 + m.queue) * 2)) : 0

  return (
    <div className={`block-node block-node--${health} shape--${shape}${lit ? ' block-node--lit' : ''}`} style={{ width: BLOCK_W, height: BLOCK_H }}>
      <svg width={BLOCK_W} height={BLOCK_H} className="block-node__bg"><RoughPaths drawables={drawn} /></svg>
      {/* Top-left: the product's logo on a round sticker, or "generic" on a block products are presets of. */}
      {def.product ? (
        <div className={`sticker${def.product.logo ? '' : ' sticker--badge'}`}>
          <svg width="30" height="30" aria-hidden="true"><RoughPaths drawables={sticker} /></svg>
          <Mark def={def} />
        </div>
      ) : hasPresets(def.type) && <span className="generic-tag">generic</span>}
      <div className="block-node__label">{def.label}</div>
      {/* One line under the label: size, then live status ("×3 · hit 72%"), so two-line labels still fit. */}
      {(replicas !== undefined || stats) && (
        <div className="block-node__sub">
          {replicas !== undefined && (data.params.read_replicas !== undefined ? `+${replicas} replicas` : `×${replicas}`)}
          {replicas !== undefined && stats && ' · '}
          {stats && <b style={{ color: health === 'bad' ? 'var(--coral-text)' : healthColor[health] }}>{stats}</b>}
        </div>
      )}
      {m && m.lambda > 0 && Number.isFinite(m.mu) && health !== 'dead' && <Gauge rho={m.rho} />}
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
