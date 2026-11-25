// Simulator state for the UI: traffic controls, killed nodes, and the latest sim result.
// While running, a timer calls tick() 10 times a second; each tick runs one step of the
// pure simulator (src/sim/engine.ts) on the current design from the design store.
import { createContext, useContext } from 'react'
import { create, useStore, type StoreApi } from 'zustand'
import { toDesign } from './design'
import { initialSim, step, TICK_S, type SimState } from './sim/engine'
import { TRAFFIC_DEFAULTS } from './sim/types'
import { useDesign } from './store'

const HISTORY_TICKS = 600 // 60 s for the p99 chart
export const SPIKE = { multiplier: 3, seconds: 10 }

type Sim = {
  running: boolean
  rps: number
  readRatio: number
  hotKey: number      // share of requests that hit the single hottest key
  payloadKb: number   // response size per read (CDN transfer pricing)
  followers: number   // fan-out on write: copies per write (edges marked fanout 'write')
  following: number   // fan-out on read: fetches per read (edges marked fanout 'read')
  spikeUntil: number // sim time when the current spike ends
  spikeMultiplier: number
  killed: string[]
  partitioned: string[] // regions whose border is cut
  replicasDown: Record<string, number> // dead replicas per block (the rest keep serving)
  primaryDown: string[] // SQL blocks whose primary is dead
  highlight: { ids: string[]; message: string } // drawn on the canvas (Claude, explainers)
  sim: SimState
  history: number[] // p99 per tick, last 60 s
  play: () => void
  pause: () => void
  reset: () => void
  tick: () => void
  setTraffic: (t: Partial<Pick<Sim, 'rps' | 'readRatio' | 'hotKey' | 'payloadKb' | 'followers' | 'following'>>) => void
  spike: (multiplier?: number, seconds?: number) => void
  setFlag: (list: 'killed' | 'partitioned' | 'primaryDown', id: string, on: boolean) => void
  setReplicasDown: (id: string, count: number) => void // clamped to 0..replicas
  setHighlight: (ids: string[], message?: string) => void
}

let timer: ReturnType<typeof setInterval> | undefined

/** No killed nodes, cut regions, dead replicas or dead primaries. Spread into setState to clear them all. */
export const NO_FAULTS = { killed: [] as string[], partitioned: [] as string[], replicasDown: {} as Record<string, number>, primaryDown: [] as string[] }

export const useSim = create<Sim>((set, get) => ({
  running: false,
  rps: 1000,
  readRatio: 0.9,
  ...TRAFFIC_DEFAULTS,
  spikeUntil: 0,
  spikeMultiplier: SPIKE.multiplier,
  ...NO_FAULTS,
  highlight: { ids: [], message: '' },
  sim: initialSim(),
  history: [],

  play: () => {
    if (!timer) timer = setInterval(() => get().tick(), TICK_S * 1000)
    set({ running: true })
  },
  pause: () => {
    clearInterval(timer)
    timer = undefined
    set({ running: false })
  },
  // Clears queues, lag and history (not the design, traffic settings or killed nodes).
  reset: () => set({ sim: initialSim(), history: [], spikeUntil: 0 }),

  tick: () => set((s) => {
    const { nodes, edges } = useDesign.getState()
    const multiplier = s.sim.t < s.spikeUntil ? s.spikeMultiplier : 1
    const traffic = { rps: s.rps, readRatio: s.readRatio, multiplier, hotKey: s.hotKey, payloadKb: s.payloadKb, followers: s.followers, following: s.following }
    const sim = step(toDesign(nodes, edges), s.sim, { traffic, killed: s.killed, partitioned: s.partitioned, replicasDown: s.replicasDown, primaryDown: s.primaryDown }, TICK_S)
    return { sim, history: [...s.history, sim.global.p99Ms].slice(-HISTORY_TICKS) }
  }),

  setTraffic: (t) => set(t),
  spike: (multiplier = SPIKE.multiplier, seconds = SPIKE.seconds) =>
    set((s) => ({ spikeUntil: s.sim.t + seconds, spikeMultiplier: multiplier })),
  setFlag: (list, id, on) => set((s) => ({ [list]: on ? [...new Set([...s[list], id])] : s[list].filter((k) => k !== id) })),
  setReplicasDown: (id, count) => set((s) => {
    const replicas = useDesign.getState().nodes.find((x) => x.id === id)?.data.params.replicas
    if (typeof replicas !== 'number') return {}
    return { replicasDown: { ...s.replicasDown, [id]: Math.min(replicas, Math.max(0, count)) } }
  }),
  setHighlight: (ids, message = '') => set({ highlight: { ids, message } }),
}))

// What the canvas blocks and edges read to draw live state. Normally the main sim (useSim); the
// compare view wraps each of its two canvases in a SimContext with that side's own run.
export type SimView = Pick<Sim, 'sim' | 'running' | 'killed' | 'partitioned' | 'highlight'> & { replicasDown?: Sim['replicasDown']; nodes?: { id: string; parentId?: string }[] }
export const SimContext = createContext<StoreApi<SimView> | null>(null)
export function useSimView<T>(select: (s: SimView) => T): T {
  return useStore(useContext(SimContext) ?? (useSim as unknown as StoreApi<SimView>), select)
}

/** Is this node killed, or inside a killed region/AZ? `nodes` defaults to the design store's. */
export function isDown(killed: string[], id: string, nodes: { id: string; parentId?: string }[] = useDesign.getState().nodes) {
  if (!killed.length) return false
  for (let cur = nodes.find((n) => n.id === id); cur; cur = nodes.find((n) => n.id === cur!.parentId)) {
    if (killed.includes(cur.id)) return true
  }
  return false
}

// Editing a block's replicas param redeploys it: its dead-replica count goes back to 0.
useDesign.subscribe((d, prev) => {
  const { replicasDown } = useSim.getState()
  const replicasOf = (nodes: typeof d.nodes, id: string) => nodes.find((n) => n.id === id)?.data.params.replicas
  const keep = Object.entries(replicasDown).filter(([id]) => replicasOf(d.nodes, id) === replicasOf(prev.nodes, id))
  if (keep.length < Object.keys(replicasDown).length) useSim.setState({ replicasDown: Object.fromEntries(keep) })
})
