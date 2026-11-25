// How one block looks on the canvas (docs/STYLE.md). React Flow positions it; we draw it.
// Shape + pastel fill = what the block does (its tone, blocks/index.ts toneOf). Live sim state:
// a ρ gauge at the top-right, coral stroke with coral hachure when saturated or failing,
// a stack of boxes for queue depth, faint with a crack when killed, a glow when Claude highlights it.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useContext, useMemo } from 'react'
import { hasPresets, registry, toneOf } from '../blocks'
import { SIDES, type FlowNode } from '../design'
import { fmtPct, healthColor, healthOf } from '../display'
import { liveReplicas } from '../sim/engine'
import { isDown, SimContext, useSim, useSimView } from '../simStore'
import { Gauge } from './Gauge'
import { gen, seedOf } from './rough'
import { Mark } from './Mark'
import { drawShape } from './shapes'
import { RoughPaths } from './RoughPaths'

export const BLOCK_W = 150
export const BLOCK_H = 72
const SIDE_POS = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }

export function BlockNode({ id, data }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const m = useSimView((s) => s.sim.metrics[id])
  const size = data.params.replicas
  const deadReplicas = useSimView((s) => s.replicasDown?.[id] ?? 0)
  const down = useSimView((s) => isDown(s.killed, id, s.nodes)) || liveReplicas(data.params, deadReplicas) === 0
  const health = healthOf(m, down)
  const lit = useSimView((s) => s.highlight.ids.includes(id))
  const shape = def.shape ?? 'box'

  // Redraw only when health changes, so the wobble doesn't jitter. Same seed = same wobble.
  const drawn = useMemo(() => {
    const o = { seed: seedOf(id), roughness: 1.2, bowing: 1 }
    const mark = { ...o, strokeWidth: 1.4, stroke: 'var(--ink)' }
    if (health === 'dead') {
      return [...drawShape(shape, { ...o, strokeWidth: 1.7, stroke: 'var(--ink-faint)', fill: 'var(--fill-dead)', fillStyle: 'solid' }, { ...mark, stroke: 'var(--ink-faint)' }),
        gen.path('M 70 2 L 82 22 L 72 38 L 90 56 L 84 70', { ...o, stroke: 'var(--ink-muted)', strokeWidth: 1.5 })]
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
          {typeof size === 'number' ? <Pips id={id} size={size} dead={deadReplicas} />
            : replicas !== undefined && `+${replicas} replicas`}
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
      {/* A connection point on each side. All are type "source" and the canvas uses ConnectionMode.Loose,
          so any dot can start or end an edge: it runs from where you start dragging to where you drop. */}
      {SIDES.map((s) => <Handle key={s} id={s} type="source" position={SIDE_POS[s]} />)}
    </div>
  )
}

const MAX_PIPS = 8

/** One dot per replica: up ones first, then dead ones. Click an up dot to kill a replica, a dead one to bring it back.
 *  Read-only in the compare view: its runs are scripted, and clicks would reach the main sim. */
function Pips({ id, size, dead }: { id: string; size: number; dead: number }) {
  const scripted = useContext(SimContext) !== null
  const shown = Math.min(size, MAX_PIPS)
  const deadShown = Math.min(dead, shown)
  return (
    <span className="pips nodrag" aria-label={`${size - dead} of ${size} replicas up`}>
      {Array.from({ length: shown }, (_, i) => {
        const up = i < shown - deadShown
        const cls = `pip${up ? '' : ' pip--dead'}`
        return scripted ? <span key={i} className={cls} />
          : <button key={i} type="button" className={cls} title={up ? 'Kill one replica' : 'Restore one replica'}
            onClick={(e) => { e.stopPropagation(); useSim.getState().setReplicasDown(id, dead + (up ? 1 : -1)) }} />
      })}
      {size > MAX_PIPS && <span>×{size}{dead > 0 && ` (${dead} down)`}</span>}
    </span>
  )
}
