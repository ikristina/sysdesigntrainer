// Saved-design format and conversion to/from React Flow's node/edge objects.
// The saved format is ours, not React Flow's: lessons, explainers and MCP will read it,
// so it must not change when the library's internals do.
import type { Connection, Edge, Node } from '@xyflow/react'
import { defaultParams, registry } from './blocks'
import type { ParamValue } from './blocks/types'

type BlockData = { blockType: string; params: Record<string, ParamValue>; label?: string }
// 'block' = normal box, 'container' = region/AZ that other nodes sit inside.
export type FlowNode = Node<BlockData, 'block' | 'container' | 'note'>

export type SavedNode = {
  id: string
  type: string
  position: { x: number; y: number }  // relative to parentId's top-left if set
  parentId?: string
  size?: { w: number; h: number }      // containers only
  params: Record<string, ParamValue>
  label?: string                       // the user's own text on the block; a note's whole text
}
/** What crosses an edge. Absent fields = reads and writes, no fan-out (the default). */
export type EdgeRoute = {
  carries?: 'read' | 'write'  // only reads or only writes take this edge
  fanout?: 'write' | 'read'   // each write is sent `followers` times / each read fetches `following` times
  sequential?: boolean        // with fanout: the N calls run one after another (latency × N), e.g. an agent's LLM loop
  share?: number              // out of a load balancer or gateway: % of the requests this edge can carry; edges without one split the rest
}
/** Which side of a block an edge leaves (`sourceHandle`) or enters (`targetHandle`). Absent = 'r' / 'l'. */
export type Side = 't' | 'r' | 'b' | 'l'
export const SIDES: Side[] = ['t', 'r', 'b', 'l']
const DEFAULT_OUT: Side = 'r'
const DEFAULT_IN: Side = 'l'
export type SavedEdge = { id: string; source: string; target: string; sourceHandle?: Side; targetHandle?: Side; label?: string } & EdgeRoute
export type Design = {
  version: 1
  nodes: SavedNode[]
  edges: SavedEdge[]
}
const routeOf = (r: EdgeRoute | undefined): EdgeRoute => ({
  ...(r?.carries && { carries: r.carries }), ...(r?.fanout && { fanout: r.fanout }), ...(r?.fanout && r.sequential && { sequential: true }), ...(r?.share !== undefined && { share: r.share }),
})

export const isContainer = (type: string) => registry[type]?.category === 'grouping'

export function toDesign(nodes: FlowNode[], edges: Edge[]): Design {
  return {
    version: 1,
    nodes: nodes.map((n) => {
      const s: SavedNode = { id: n.id, type: n.data.blockType, position: n.position, params: n.data.params }
      if (n.parentId) s.parentId = n.parentId
      if (n.data.label) s.label = n.data.label
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
      ...(typeof e.label === 'string' && e.label && { label: e.label }),
    })),
  }
}

export function makeNode(s: SavedNode): FlowNode {
  const n: FlowNode = {
    id: s.id,
    type: isContainer(s.type) ? 'container' : s.type === 'note' ? 'note' : 'block',
    position: s.position,
    data: { blockType: s.type, params: { ...defaultParams(s.type), ...s.params }, ...(s.label && { label: s.label }) },
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
    if (n.label !== undefined && typeof n.label !== 'string') throw new Error(`Node ${n.id}: label must be text`)
  }
  for (const e of d.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) throw new Error(`Edge ${e.id} points at a missing node`)
    if (e.carries && !['read', 'write'].includes(e.carries)) throw new Error(`Edge ${e.id}: carries must be "read" or "write"`)
    if (e.fanout && !['read', 'write'].includes(e.fanout)) throw new Error(`Edge ${e.id}: fanout must be "read" or "write"`)
    for (const h of [e.sourceHandle, e.targetHandle]) {
      if (h !== undefined && !SIDES.includes(h)) throw new Error(`Edge ${e.id}: handle must be one of ${SIDES.join(', ')}`)
    }
    if (e.label !== undefined && typeof e.label !== 'string') throw new Error(`Edge ${e.id}: label must be text`)
    if (e.share !== undefined && !(typeof e.share === 'number' && e.share >= 0)) throw new Error(`Edge ${e.id}: share must be a number ≥ 0`)
    if (e.sequential !== undefined && typeof e.sequential !== 'boolean') throw new Error(`Edge ${e.id}: sequential must be true or false`)
  }
  return {
    nodes: d.nodes.map(makeNode),
    edges: d.edges.map(makeEdge),
  }
}

const makeEdge = (e: SavedEdge): Edge => ({
  id: e.id, source: e.source, target: e.target, type: 'rough', data: routeOf(e),
  sourceHandle: e.sourceHandle ?? DEFAULT_OUT, targetHandle: e.targetHandle ?? DEFAULT_IN,
  ...(e.label && { label: e.label }),
})

/** Copy-paste: copies of the `ids` nodes (plus everything inside a copied region/AZ) and the edges
 *  between them, with new ids from `newId`. Top-level copies move by `offset` and keep their parent. */
export function cloneSubgraph(nodes: FlowNode[], edges: Edge[], ids: string[], newId: (type: string) => string, offset = 30) {
  const picked = new Set(ids)
  for (let grew = true; grew;) {
    grew = false
    for (const n of nodes) if (n.parentId && picked.has(n.parentId) && !picked.has(n.id)) { picked.add(n.id); grew = true }
  }
  const d = toDesign(nodes.filter((n) => picked.has(n.id)), edges.filter((e) => picked.has(e.source) && picked.has(e.target)))
  const id = new Map(d.nodes.map((n) => [n.id, newId(n.type)]))
  return {
    nodes: d.nodes.map((n) => {
      const inside = !!n.parentId && id.has(n.parentId)
      return makeNode({
        ...n, id: id.get(n.id)!, parentId: inside ? id.get(n.parentId!) : n.parentId,
        position: inside ? n.position : { x: n.position.x + offset, y: n.position.y + offset },
      })
    }),
    edges: d.edges.map((e) => makeEdge({ ...e, id: `${id.get(e.source)}-${id.get(e.target)}`, source: id.get(e.source)!, target: id.get(e.target)! })),
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
