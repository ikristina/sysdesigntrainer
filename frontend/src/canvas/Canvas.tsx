// The design canvas. React Flow does pan/zoom, dragging, selecting and connecting;
// we feed it nodes/edges from the store and handle drops from the palette.
// readOnly (explainers): no dragging, connecting, selecting, deleting or dropping.
import {
  Background, BackgroundVariant, Controls, ReactFlow, useReactFlow, type XYPosition,
} from '@xyflow/react'
import { useCallback, useState, type DragEvent } from 'react'
import { isContainer, type FlowNode } from '../design'
import { useDesign } from '../store'
import { BLOCK_H, BLOCK_W, BlockNode } from './BlockNode'
import { ContainerNode } from './ContainerNode'
import { RoughEdge } from './RoughEdge'

// Defined outside the component so React Flow doesn't see "new" types on every render.
const nodeTypes = { block: BlockNode, container: ContainerNode }
const edgeTypes = { rough: RoughEdge }

export const DRAG_MIME = 'application/x-sysdesign-block'

export function Canvas({ readOnly = false }: { readOnly?: boolean }) {
  const nodes = useDesign((s) => s.nodes)
  const edges = useDesign((s) => s.edges)
  const onNodesChange = useDesign((s) => s.onNodesChange)
  const onEdgesChange = useDesign((s) => s.onEdgesChange)
  const onConnect = useDesign((s) => s.onConnect)
  const addBlock = useDesign((s) => s.addBlock)
  // Zoom to fit only if the page opened with an autosaved design, not when you drop the first block.
  const [fitOnOpen] = useState(() => nodes.length > 0)
  const { screenToFlowPosition, getIntersectingNodes, getInternalNode, changeParent } = useReactFlow<FlowNode>()

  // Smallest region/AZ under a point (so a node dropped in an AZ goes into the AZ, not the region).
  // `skipId` excludes a node and everything inside it, so a region can't be put inside its own AZ.
  const containerAt = useCallback((p: XYPosition, skipId?: string) => {
    const insideSkipped = (n: FlowNode) => {
      for (let cur: FlowNode | undefined = n; cur; cur = cur.parentId ? getInternalNode(cur.parentId)?.internals.userNode : undefined) {
        if (cur.id === skipId) return true
      }
      return false
    }
    const area = (n: FlowNode) => (n.width ?? 0) * (n.height ?? 0)
    return getIntersectingNodes({ x: p.x, y: p.y, width: 1, height: 1 })
      .filter((n) => n.type === 'container' && !insideSkipped(n))
      .sort((a, b) => area(a) - area(b))[0]
  }, [getIntersectingNodes, getInternalNode])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData(DRAG_MIME)
    if (!type) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // Center normal blocks on the cursor; containers start at the cursor.
    const pos = isContainer(type) ? p : { x: p.x - BLOCK_W / 2, y: p.y - BLOCK_H / 2 }
    const parent = containerAt(p)
    if (!parent) return addBlock(type, pos)
    // Child positions are relative to the parent's top-left corner.
    const abs = getInternalNode(parent.id)!.internals.positionAbsolute
    addBlock(type, { x: pos.x - abs.x, y: pos.y - abs.y }, parent.id)
  }, [screenToFlowPosition, containerAt, getInternalNode, addBlock])

  // After a drag, move the node into (or out of) whichever container its center is over.
  const onNodeDragStop = useCallback((_: unknown, node: FlowNode) => {
    const internal = getInternalNode(node.id)
    if (!internal) return
    const { x, y } = internal.internals.positionAbsolute
    const center = { x: x + (internal.measured.width ?? 0) / 2, y: y + (internal.measured.height ?? 0) / 2 }
    const target = containerAt(center, node.id)
    if ((target?.id ?? undefined) !== node.parentId) changeParent(node.id, target?.id ?? null)
  }, [getInternalNode, containerAt, changeParent])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={readOnly ? undefined : onDrop}
      onDragOver={readOnly ? undefined : onDragOver}
      onNodeDragStop={onNodeDragStop}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      deleteKeyCode={readOnly ? null : 'Backspace'}
      fitView={fitOnOpen}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} color="#D9D4C7" bgColor="#FBFAF6" />
      <Controls />
    </ReactFlow>
  )
}
