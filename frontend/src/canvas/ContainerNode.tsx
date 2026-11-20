// Region / AZ: a dashed rough frame that other nodes sit inside. Resizable when selected.
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { registry } from '../blocks'
import type { FlowNode } from '../design'
import { roughRect, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export function ContainerNode({ id, data, selected, width = 0, height = 0 }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const frame = useMemo(
    () => roughRect(width, height, {
      seed: seedOf(id), roughness: 1.5, strokeWidth: 2, strokeLineDash: [8, 8],
      stroke: selected ? '#2F6FDE' : '#8A8578',
    }),
    [id, width, height, selected],
  )
  return (
    <div className="container-node" style={{ width, height }}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} color="#2F6FDE" />
      <svg width={width} height={height} className="block-node__bg"><RoughPaths drawables={[frame]} /></svg>
      <div className="container-node__label">{def.label.toLowerCase()} · {String(data.params.name)}</div>
    </div>
  )
}
