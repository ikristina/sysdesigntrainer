// App state (Zustand). The single source of truth for the design graph.
// React components read from it with useDesign(selector) and re-render when that slice changes.
import { addEdge, reconnectEdge, type Connection, type Edge, type EdgeChangeset, type NodeChangeset } from '@xyflow/react'
import { create } from 'zustand'
import type { ParamValue } from './blocks/types'
import { canLink, cloneSubgraph, type EdgeRoute, type FlowNode, fromDesign, loadLocal, makeNode, SANDBOX_KEY, saveLocal, toDesign, isContainer } from './design'

type State = {
  nodes: FlowNode[]
  edges: Edge[]
  storageKey: string | null // localStorage key autosave writes to; null = don't save (explainers)
  // React Flow reports drags, selections, deletions, resizes as "changes"; we apply them here.
  onNodesChange: (changes: NodeChangeset<FlowNode>) => void
  onEdgesChange: (changes: EdgeChangeset<Edge>) => void
  onConnect: (c: Connection) => void
  onReconnect: (old: Edge, c: Connection) => void // an edge's end dragged to another handle; keeps its data
  addBlock: (type: string, position: { x: number; y: number }, parentId?: string) => void
  setParam: (id: string, key: string, value: ParamValue) => void
  setLabel: (id: string, label: string) => void // the user's own text on a block; '' removes it
  setRoute: (id: string, route: EdgeRoute) => void // what an edge carries and whether it fans out
  setEdgeLabel: (id: string, label: string) => void // the user's own text on an edge; '' removes it
  copy: () => void  // remember the selected nodes (Cmd/Ctrl+C)
  paste: () => void // add copies of them, selected, each paste a bit further along (Cmd/Ctrl+V)
  duplicate: () => void // copy + paste the selection in one go, leaving the clipboard alone (Cmd/Ctrl+D)
  loadDesign: (json: unknown) => void // throws on invalid input
  // Switch to the design saved under `key` (or `initial` if nothing is saved there yet).
  open: (key: string | null, initial?: unknown) => void
}

const CONTAINER_SIZE: Record<string, { w: number; h: number }> = {
  region: { w: 520, h: 340 },
  az: { w: 280, h: 200 },
}

const newId = (type: string) => `${type}_${Math.random().toString(36).slice(2, 6)}`

const saved = loadLocal(SANDBOX_KEY)

// What Cmd/Ctrl+C copied: a snapshot, so editing or deleting the originals doesn't change what pastes.
let clipboard: { nodes: FlowNode[]; edges: Edge[]; ids: string[]; pastes: number } | null = null

export const useDesign = create<State>((set, get) => ({
  nodes: saved?.nodes ?? [],
  edges: saved?.edges ?? [],
  storageKey: SANDBOX_KEY,

  onNodesChange: (changes) => set((s) => ({ nodes: changes.applyTo(s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: changes.applyTo(s.edges) })),
  onConnect: (c) => set((s) => (canLink(s.edges, c) ? { edges: addEdge({ ...c, type: 'rough' }, s.edges) } : {})),
  // reconnectEdge keeps everything but the ends (data: carries / fanout), and gives it a new id from them.
  onReconnect: (old, c) => set((s) => (canLink(s.edges, c, old.id) ? { edges: reconnectEdge(old, c, s.edges) } : {})),

  addBlock: (type, position, parentId) =>
    set((s) => ({
      nodes: [...s.nodes, makeNode({
        id: newId(type), type, position, parentId, params: {},
        size: isContainer(type) ? CONTAINER_SIZE[type] : undefined,
      })],
    })),

  setParam: (id, key, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } } : n),
    })),

  setLabel: (id, label) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: label || undefined } } : n)) })),

  setRoute: (id, route) =>
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...route } } : e)) })),

  setEdgeLabel: (id, label) =>
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, label: label || undefined } : e)) })),

  copy: () => {
    const { nodes, edges } = get()
    const ids = nodes.filter((n) => n.selected).map((n) => n.id)
    if (ids.length) clipboard = { nodes, edges, ids, pastes: 0 }
  },

  paste: () => {
    if (!clipboard) return
    const live = new Set(get().nodes.map((n) => n.id))
    const c = cloneSubgraph(clipboard.nodes, clipboard.edges, clipboard.ids, newId, 30 * ++clipboard.pastes)
    // A copy whose parent region/AZ was deleted since the copy goes to the top level (same x/y, now from the canvas origin).
    const nodes = c.nodes.map((n) => (n.parentId && !live.has(n.parentId) && !c.nodes.some((m) => m.id === n.parentId)
      ? { ...n, parentId: undefined, selected: true } : { ...n, selected: true }))
    set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...nodes], edges: [...s.edges, ...c.edges] }))
  },

  duplicate: () => {
    const { nodes, edges } = get()
    const c = cloneSubgraph(nodes, edges, nodes.filter((n) => n.selected).map((n) => n.id), newId)
    if (!c.nodes.length) return
    set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...c.nodes.map((n) => ({ ...n, selected: true }))], edges: [...s.edges, ...c.edges] }))
  },

  loadDesign: (json) => set(fromDesign(json)),

  open: (key, initial) => set({
    storageKey: key,
    ...((key && loadLocal(key)) || (initial ? fromDesign(initial) : { nodes: [], edges: [] })),
  }),
}))

// Autosave: every change to nodes/edges is written to localStorage (under storageKey).
// ponytail: saves on every drag frame; debounce if large designs feel slow.
useDesign.subscribe((s, prev) => {
  if (s.storageKey && (s.nodes !== prev.nodes || s.edges !== prev.edges)) saveLocal(s.storageKey, toDesign(s.nodes, s.edges))
})
