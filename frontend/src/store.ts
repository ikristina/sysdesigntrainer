// App state (Zustand). The single source of truth for the design graph.
// React components read from it with useDesign(selector) and re-render when that slice changes.
import { addEdge, type Connection, type Edge, type EdgeChangeset, type NodeChangeset } from '@xyflow/react'
import { create } from 'zustand'
import type { ParamValue } from './blocks/types'
import { type FlowNode, fromDesign, loadLocal, makeNode, saveLocal, toDesign, isContainer } from './design'

type State = {
  nodes: FlowNode[]
  edges: Edge[]
  // React Flow reports drags, selections, deletions, resizes as "changes"; we apply them here.
  onNodesChange: (changes: NodeChangeset<FlowNode>) => void
  onEdgesChange: (changes: EdgeChangeset<Edge>) => void
  onConnect: (c: Connection) => void
  addBlock: (type: string, position: { x: number; y: number }, parentId?: string) => void
  setParam: (id: string, key: string, value: ParamValue) => void
  loadDesign: (json: unknown) => void // throws on invalid input
}

const CONTAINER_SIZE: Record<string, { w: number; h: number }> = {
  region: { w: 520, h: 340 },
  az: { w: 280, h: 200 },
}

const newId = (type: string) => `${type}_${Math.random().toString(36).slice(2, 6)}`

const saved = loadLocal()

export const useDesign = create<State>((set) => ({
  nodes: saved?.nodes ?? [],
  edges: saved?.edges ?? [],

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

  loadDesign: (json) => set(fromDesign(json)),
}))

// Autosave: every change to nodes/edges is written to localStorage.
// ponytail: saves on every drag frame; debounce if large designs feel slow.
useDesign.subscribe((s, prev) => {
  if (s.nodes !== prev.nodes || s.edges !== prev.edges) saveLocal(toDesign(s.nodes, s.edges))
})
