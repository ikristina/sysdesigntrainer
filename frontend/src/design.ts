// Saved-design format and conversion to/from React Flow's node/edge objects.
// The saved format is ours, not React Flow's: lessons, explainers and MCP will read it,
// so it must not change when the library's internals do.
import type { Connection, Edge, Node } from '@xyflow/react'
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
/** What crosses an edge. Absent fields = reads and writes, no fan-out (the default). */
export type EdgeRoute = {
  carries?: 'read' | 'write'  // only reads or only writes take this edge
  fanout?: 'write' | 'read'   // each write is sent `followers` times / each read fetches `following` times
  sequential?: boolean        // with fanout: the N calls run one after another (latency × N), e.g. an agent's LLM loop
}
/** Which side of a block an edge leaves (`sourceHandle`) or enters (`targetHandle`). Absent = 'r' / 'l'. */
export type Side = 't' | 'r' | 'b' | 'l'
export const SIDES: Side[] = ['t', 'r', 'b', 'l']
export const DEFAULT_OUT: Side = 'r'
export const DEFAULT_IN: Side = 'l'
export type SavedEdge = { id: string; source: string; target: string; sourceHandle?: Side; targetHandle?: Side } & EdgeRoute
export type Design = {
  version: 1
  nodes: SavedNode[]
  edges: SavedEdge[]
}
const routeOf = (r: EdgeRoute | undefined): EdgeRoute => ({
  ...(r?.carries && { carries: r.carries }), ...(r?.fanout && { fanout: r.fanout }), ...(r?.fanout && r.sequential && { sequential: true }),
})

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
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      // Default sides are left out, so designs drawn before handles existed save exactly as before.
      ...(e.sourceHandle && e.sourceHandle !== DEFAULT_OUT && { sourceHandle: e.sourceHandle as Side }),
      ...(e.targetHandle && e.targetHandle !== DEFAULT_IN && { targetHandle: e.targetHandle as Side }),
      ...routeOf(e.data as EdgeRoute),
    })),
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
    if (e.carries && !['read', 'write'].includes(e.carries)) throw new Error(`Edge ${e.id}: carries must be "read" or "write"`)
    if (e.fanout && !['read', 'write'].includes(e.fanout)) throw new Error(`Edge ${e.id}: fanout must be "read" or "write"`)
    for (const h of [e.sourceHandle, e.targetHandle]) {
      if (h !== undefined && !SIDES.includes(h)) throw new Error(`Edge ${e.id}: handle must be one of ${SIDES.join(', ')}`)
    }
    if (e.sequential !== undefined && typeof e.sequential !== 'boolean') throw new Error(`Edge ${e.id}: sequential must be true or false`)
  }
  return {
    nodes: d.nodes.map(makeNode),
    edges: d.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: 'rough', data: routeOf(e),
      sourceHandle: e.sourceHandle ?? DEFAULT_OUT, targetHandle: e.targetHandle ?? DEFAULT_IN,
    })),
  }
}

/** Can this connection be added (or an existing edge, `movingId`, be moved to it)? No self-loops and
 * at most one edge per direction between two blocks: the sim would count a parallel edge twice. */
export const canLink = (edges: Edge[], c: Connection, movingId?: string) =>
  c.source !== c.target && !edges.some((e) => e.id !== movingId && e.source === c.source && e.target === c.target)

// Where the sandbox autosaves. Each lesson saves under its own key (see lessons/lessonStore.ts).
export const SANDBOX_KEY = 'sysdesign.design'

export function saveLocal(key: string, d: Design) {
  localStorage.setItem(key, JSON.stringify(d))
}

export function loadLocal(key: string): ReturnType<typeof fromDesign> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? fromDesign(JSON.parse(raw)) : null
  } catch {
    return null // corrupt or old autosave: start with an empty canvas
  }
}
