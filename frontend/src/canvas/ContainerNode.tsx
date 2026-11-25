// Region / AZ: a dashed rough frame that other nodes sit inside (a region's has cloud-like scallops). Resizable when selected.
// Red with "down" when killed, orange with "partitioned" when its border is cut.
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { registry } from '../blocks'
import { isDown, useSimView } from '../simStore'
import type { FlowNode } from '../design'
import { gen, roughRect, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export function ContainerNode({ id, data, selected, width = 0, height = 0 }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const down = useSimView((s) => isDown(s.killed, id, s.nodes)) // killing a region/AZ kills everything inside
  const cut = useSimView((s) => s.partitioned.includes(id))
  const frame = useMemo(
    () => {
      const o = { seed: seedOf(id), roughness: 1.5, strokeWidth: 2, strokeLineDash: [8, 8],
        stroke: selected ? 'var(--violet)' : down ? 'var(--coral)' : cut ? 'var(--amber)' : 'var(--ink-faint)' }
      return data.blockType === 'region' ? gen.path(cloudFrame(width, height), o) : roughRect(width, height, o)
    },
    [id, data.blockType, width, height, selected, down, cut],
  )
  return (
    <div className="container-node" style={{ width, height }}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} color="var(--violet)" />
      <svg width={width} height={height} className="block-node__bg"><RoughPaths drawables={[frame]} /></svg>
      <div className="container-node__label">{def.label.toLowerCase()} · {String(data.params.name)}{down && ' · down'}{cut && ' · partitioned'}</div>
    </div>
  )
}

/** A box whose edges are rows of outward bumps, BUMP px deep, so the region reads as a cloud. */
const BUMP = 9
function cloudFrame(w: number, h: number) {
  const side = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 70)), rot = x0 === x1 ? 90 : 0
    let d = ''
    for (let i = 1; i <= n; i++) d += ` A ${len / n / 2} ${BUMP} ${rot} 0 1 ${x0 + ((x1 - x0) * i) / n} ${y0 + ((y1 - y0) * i) / n}`
    return d
  }
  const [l, t, r, b] = [BUMP + 1, BUMP + 1, w - BUMP - 1, h - BUMP - 1]
  return `M ${l} ${t}${side(l, t, r, t)}${side(r, t, r, b)}${side(r, b, l, b)}${side(l, b, l, t)} Z`
}
