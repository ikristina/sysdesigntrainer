// Saved-design format and conversion to/from React Flow's node/edge objects.
// The saved format is ours, not React Flow's: lessons, explainers and MCP will read it,
// so it must not change when the library's internals do.
import type { Edge, Node } from '@xyflow/react'
import { defaultParams, registry } from './blocks'
import type { ParamValue } from './blocks/types'

export type BlockData = { blockType: string; params: Record<string, ParamValue> }
// 'block' = normal box, 'container' = region/AZ that other nodes sit inside.
export type FlowNode = Node<BlockData, 'block' | 'container'>

export type SavedNode = {
  id: string
  type: string
  position: { x: number; y: number }  // relative to parentId's top-left if set
  parentId?: string
  size?: { w: number; h: number }      // containers only
  params: Record<string, ParamValue>
}
export type Design = {
  version: 1
  nodes: SavedNode[]
  edges: { id: string; source: string; target: string }[]
}

export const isContainer = (type: string) => registry[type]?.category === 'grouping'

export function toDesign(nodes: FlowNode[], edges: Edge[]): Design {
  return {
    version: 1,
    nodes: nodes.map((n) => {
      const s: SavedNode = { id: n.id, type: n.data.blockType, position: n.position, params: n.data.params }
      if (n.parentId) s.parentId = n.parentId
      if (n.type === 'container') {
        s.size = { w: n.width ?? n.measured?.width ?? 0, h: n.height ?? n.measured?.height ?? 0 }
      }
      return s
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

export function makeNode(s: SavedNode): FlowNode {
  const n: FlowNode = {
    id: s.id,
    type: isContainer(s.type) ? 'container' : 'block',
    position: s.position,
    data: { blockType: s.type, params: { ...defaultParams(s.type), ...s.params } },
  }
  if (s.parentId) n.parentId = s.parentId
  if (s.size) { n.width = s.size.w; n.height = s.size.h }
  return n
}

// Throws an Error with a readable message if the input isn't a valid design.
export function fromDesign(input: unknown): { nodes: FlowNode[]; edges: Edge[] } {
  const d = input as Design
  if (!d || d.version !== 1 || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) {
    throw new Error('Not a design file (expected version 1 with nodes and edges)')
  }
  const ids = new Set(d.nodes.map((n) => n.id))
  for (const n of d.nodes) {
    if (!registry[n.type]) throw new Error(`Unknown block type "${n.type}" on node ${n.id}`)
    if (n.parentId && !ids.has(n.parentId)) throw new Error(`Node ${n.id} has missing parent ${n.parentId}`)
  }
  for (const e of d.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) throw new Error(`Edge ${e.id} points at a missing node`)
  }
  return {
    nodes: d.nodes.map(makeNode),
    edges: d.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: 'rough' })),
  }
}

const STORAGE_KEY = 'sysdesign.design'

export function saveLocal(d: Design) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
}

export function loadLocal(): ReturnType<typeof fromDesign> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? fromDesign(JSON.parse(raw)) : null
  } catch {
    return null // corrupt or old autosave: start with an empty canvas
  }
}
