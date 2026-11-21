// App state (Zustand). The single source of truth for the design graph.
// React components read from it with useDesign(selector) and re-render when that slice changes.
import { addEdge, type Connection, type Edge, type EdgeChangeset, type NodeChangeset } from '@xyflow/react'
import { create } from 'zustand'
import type { ParamValue } from './blocks/types'
import { type EdgeRoute, type FlowNode, fromDesign, loadLocal, makeNode, SANDBOX_KEY, saveLocal, toDesign, isContainer } from './design'

type State = {
  nodes: FlowNode[]
  edges: Edge[]
  storageKey: string | null // localStorage key autosave writes to; null = don't save (explainers)
  // React Flow reports drags, selections, deletions, resizes as "changes"; we apply them here.
  onNodesChange: (changes: NodeChangeset<FlowNode>) => void
  onEdgesChange: (changes: EdgeChangeset<Edge>) => void
  onConnect: (c: Connection) => void
  addBlock: (type: string, position: { x: number; y: number }, parentId?: string) => void
  setParam: (id: string, key: string, value: ParamValue) => void
  setRoute: (id: string, route: EdgeRoute) => void // what an edge carries and whether it fans out
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

export const useDesign = create<State>((set) => ({
  nodes: saved?.nodes ?? [],
  edges: saved?.edges ?? [],
  storageKey: SANDBOX_KEY,

  onNodesChange: (changes) => set((s) => ({ nodes: changes.applyTo(s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: changes.applyTo(s.edges) })),
  onConnect: (c) => set((s) => ({ edges: addEdge({ ...c, type: 'rough' }, s.edges) })),

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

  setRoute: (id, route) =>
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...route } } : e)) })),

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
