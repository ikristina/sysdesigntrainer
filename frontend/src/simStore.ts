// Simulator state for the UI: traffic controls, killed nodes, and the latest sim result.
// While running, a timer calls tick() 10 times a second; each tick runs one step of the
// pure simulator (src/sim/engine.ts) on the current design from the design store.
import { create } from 'zustand'
import { toDesign } from './design'
import { initialSim, step, type SimState } from './sim/engine'
import { useDesign } from './store'

export const TICK_S = 0.1 // 10 ticks per second of sim time, run in real time
const HISTORY_TICKS = 600 // 60 s for the p99 chart
export const SPIKE = { multiplier: 3, seconds: 10 }

type Sim = {
  running: boolean
  rps: number
  readRatio: number
  spikeUntil: number // sim time when the current spike ends
  killed: string[]
  sim: SimState
  history: number[] // p99 per tick, last 60 s
  play: () => void
  pause: () => void
  reset: () => void
  tick: () => void
  setRps: (rps: number) => void
  setReadRatio: (r: number) => void
  spike: () => void
  toggleKill: (id: string) => void
}

let timer: ReturnType<typeof setInterval> | undefined

export const useSim = create<Sim>((set, get) => ({
  running: false,
  rps: 1000,
  readRatio: 0.9,
  spikeUntil: 0,
  killed: [],
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
    const multiplier = s.sim.t < s.spikeUntil ? SPIKE.multiplier : 1
    const sim = step(toDesign(nodes, edges), s.sim, { traffic: { rps: s.rps, readRatio: s.readRatio, multiplier }, killed: s.killed }, TICK_S)
    return { sim, history: [...s.history, sim.global.p99Ms].slice(-HISTORY_TICKS) }
  }),

  setRps: (rps) => set({ rps }),
  setReadRatio: (readRatio) => set({ readRatio }),
  spike: () => set((s) => ({ spikeUntil: s.sim.t + SPIKE.seconds })),
  toggleKill: (id) => set((s) => ({
    killed: s.killed.includes(id) ? s.killed.filter((k) => k !== id) : [...s.killed, id],
  })),
}))

/** Is this node killed, or inside a killed region/AZ? */
export function isDown(killed: string[], id: string) {
  if (!killed.length) return false
  const nodes = useDesign.getState().nodes
  for (let cur = nodes.find((n) => n.id === id); cur; cur = nodes.find((n) => n.id === cur!.parentId)) {
    if (killed.includes(cur.id)) return true
  }
  return false
}
