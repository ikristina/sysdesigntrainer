// Explainer step ops, as pure functions: (scene, step) -> next scene. The player pushes a scene
// into the sandbox stores. Back = replay steps 0..k from scratch, so state always matches the step.
import type { Design } from '../design'
import { graph, type Explainer, type ExplainerStep } from '../lessons/content'

export type Scene = {
  design: Design
  rps: number
  readRatio: number
  killed: string[]
  highlight: string[]
  resetSim: boolean // this step loaded a new graph: start the sim fresh
}

const emptyScene = (): Scene =>
  ({ design: { version: 1, nodes: [], edges: [] }, rps: 1000, readRatio: 0.9, killed: [], highlight: [], resetSim: true })

export function applyStep(prev: Scene, step: ExplainerStep): Scene {
  let { nodes, edges } = step.graph ? graph(step.graph) : prev.design
  const s: Scene = { ...prev, highlight: step.highlight ?? [], resetSim: !!step.graph }
  if (step.graph) s.killed = []

  for (const a of step.add ?? []) {
    let position = a.position ?? { x: 0, y: 0 }
    let parentId: string | undefined
    if (a.between) {
      const [from, to] = a.between.map((id) => nodes.find((n) => n.id === id)!)
      position = { x: (from.position.x + to.position.x) / 2, y: (from.position.y + to.position.y) / 2 }
      parentId = from.parentId
      edges = [...edges.filter((e) => !(e.source === from.id && e.target === to.id)),
        { id: `${from.id}-${a.id}`, source: from.id, target: a.id }, { id: `${a.id}-${to.id}`, source: a.id, target: to.id }]
    }
    nodes = [...nodes, { id: a.id, type: a.type, position, params: a.params ?? {}, ...(parentId ? { parentId } : {}) }]
  }
  if (step.remove) {
    const gone = new Set(step.remove)
    nodes = nodes.filter((n) => !gone.has(n.id))
    edges = edges.filter((e) => !gone.has(e.source) && !gone.has(e.target))
  }
  for (const [id, params] of Object.entries(step.set_params ?? {})) {
    nodes = nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, ...params } } : n))
  }
  if (step.traffic?.rps !== undefined) s.rps = step.traffic.rps
  if (step.traffic?.read_ratio !== undefined) s.readRatio = step.traffic.read_ratio
  if (step.kill) s.killed = [...new Set([...s.killed, ...step.kill])]
  s.design = { version: 1, nodes, edges }
  return s
}

/** The scene after steps 0..index. */
export const sceneAt = (e: Explainer, index: number) => e.steps.slice(0, index + 1).reduce(applyStep, emptyScene())
