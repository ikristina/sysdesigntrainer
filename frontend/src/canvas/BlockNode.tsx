// How one block looks on the canvas. React Flow positions it; we draw it.
// Phase 1: every block is a rough box. Per-category shapes come in Phase 5.
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { categoryColor, registry } from '../blocks'
import type { FlowNode } from '../design'
import { roughRect, seedOf } from './rough'
import { RoughPaths } from './RoughPaths'

export const BLOCK_W = 150
export const BLOCK_H = 64

export function BlockNode({ id, data, selected }: NodeProps<FlowNode>) {
  const def = registry[data.blockType]
  const color = categoryColor(def.category)
  // Redraw only when selection changes, so the wobble doesn't jitter while dragging.
  const box = useMemo(
    () => roughRect(BLOCK_W, BLOCK_H, {
      seed: seedOf(id), roughness: 1.2, strokeWidth: selected ? 2.5 : 1.8,
      stroke: selected ? '#2F6FDE' : '#1E1E1E', fill: '#FFFFFF', fillStyle: 'solid',
    }),
    [id, selected],
  )
  const replicas = data.params.replicas ?? data.params.read_replicas
  return (
    <div className="block-node" style={{ width: BLOCK_W, height: BLOCK_H }}>
      <svg width={BLOCK_W} height={BLOCK_H} className="block-node__bg"><RoughPaths drawables={[box]} /></svg>
      <div className="block-node__label">
        <span style={{ color }}>{def.icon}</span> {def.label}
      </div>
      {replicas !== undefined && (
        <div className="block-node__sub">
          {data.params.read_replicas !== undefined ? `+${replicas} read replicas` : `×${replicas}`}
        </div>
      )}
      {/* Connection points: drag from the right dot of one block to the left dot of another. */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
