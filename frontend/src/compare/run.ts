// Compare runs (docs/SPEC.md "Compare view"): the same scenario timeline on two designs, then a
// table of the numbers with the better side per row. Pure functions, no React: the compare
// store ticks these live, and lessons/content.test.ts runs them headless.
import { registry } from '../blocks'
import { fromDesign, toDesign, type Design } from '../design'
import { fmtCount, fmtMs, fmtPct, fmtRps } from '../display'
import type { Scenario } from '../lessons/content'
import { initialSim, step, type SimState } from '../sim/engine'
import type { Traffic } from '../lessons/content'

export const TICK_S = 0.1
export type Sample = { t: number; p50: number; p99: number; thr: number; err: number; cost: number; backlog: number; hit?: number }
export type Run = {
  design: Design // with default params filled in
  sim: SimState
  killed: string[]
  traffic: Required<Traffic>
  spikeUntil: number
  multiplier: number
  history: Sample[]
}

/** Fill in default params, the way the app does when it loads a design. */
export const withDefaults = (d: Design) => { const f = fromDesign(d); return toDesign(f.nodes, f.edges) }

/** Side B of a compare lesson: the same design with one node's block type swapped.
 *  Params the new block doesn't have are dropped, so it starts from its own defaults. */
export function swapped(d: Design, node: string, type: string): Design {
  const keys = new Set(registry[type].params.map((p) => p.key))
  return {
    ...d,
    nodes: d.nodes.map((n) => (n.id === node
      ? { ...n, type, params: Object.fromEntries(Object.entries(n.params).filter(([k]) => keys.has(k))) } : n)),
  }
}

export const startRun = (design: Design, sc: Scenario): Run => ({
  design: withDefaults(design), sim: initialSim(), killed: [], spikeUntil: 0, multiplier: 1, history: [],
  traffic: { rps: sc.traffic.rps, read_ratio: sc.traffic.read_ratio, hot_key: sc.traffic.hot_key ?? 0 },
})

/** One tick: apply the events due in [t, t + dt), step the sim, record a sample. */
export function tickRun(r: Run, sc: Scenario, watch?: string, dt = TICK_S): Run {
  const t = r.sim.t
  let { design, killed, traffic, spikeUntil, multiplier } = r
  // ponytail: float time; an event at 10 s lands on the tick starting at ~10.0 (± one float step).
  for (const e of sc.events.filter((x) => x.at >= t - 1e-9 && x.at < t + dt - 1e-9)) {
    if (e.kill) killed = [...new Set([...killed, ...e.kill])]
    if (e.restore) killed = killed.filter((id) => !e.restore!.includes(id))
    if (e.traffic) traffic = { ...traffic, ...e.traffic }
    if (e.spike) { spikeUntil = t + e.spike.seconds; multiplier = e.spike.multiplier }
    if (e.set_params) design = setParams(design, e.set_params)
  }
  const sim = step(design, r.sim, {
    traffic: { rps: traffic.rps, readRatio: traffic.read_ratio, hotKey: traffic.hot_key, multiplier: t < spikeUntil ? multiplier : 1 },
    killed,
  }, dt)
  const g = sim.global
  // Backlog = the most requests or messages waiting in any one block, as in the lesson checks.
  const backlog = Math.max(0, ...Object.values(sim.metrics).map((m) => m.queue))
  const sample: Sample = { t: sim.t, p50: g.p50Ms, p99: g.p99Ms, thr: g.throughput, err: g.errorPct, cost: g.costHr, backlog }
  if (watch && sim.metrics[watch]?.hit !== undefined) sample.hit = sim.metrics[watch].hit
  return { design, sim, killed, traffic, spikeUntil, multiplier, history: [...r.history, sample] }
}

function setParams(d: Design, set: Record<string, Record<string, number | string>>): Design {
  return {
    ...d,
    nodes: d.nodes.map((n) => {
      if (!set[n.id]) return n
      const keys = new Set(registry[n.type].params.map((p) => p.key))
      return { ...n, params: { ...n.params, ...Object.fromEntries(Object.entries(set[n.id]).filter(([k]) => keys.has(k))) } }
    }),
  }
}

/** Run a whole scenario headless. */
export function runScenario(design: Design, sc: Scenario, watch?: string): Run {
  let r = startRun(design, sc)
  while (r.sim.t < sc.seconds - 1e-9) r = tickRun(r, sc, watch)
  return r
}

export type Row = { label: string; values: [string, string]; raw: [number, number]; winner: 0 | 1 | null; about: string }

/** The compare table. Each row picks a winner (null when within 2%, or within `eps`, or both infinite).
 *  Recovery is measured from the first kill, spike or param change; a traffic change is a new
 *  normal, not a failure, so it doesn't count. */
export function summarize([a, b]: [Run, Run], sc: Scenario): Row[] {
  const disrupt = sc.events.filter((e) => e.kill || e.spike || e.set_params).map((e) => e.at)
  const te = disrupt.length ? Math.min(...disrupt) : null
  const rows: Row[] = []
  const add = (label: string, about: string, f: (r: Run) => number, fmt: (n: number) => string, better: 'high' | 'low', eps: number) => {
    const raw: [number, number] = [f(a), f(b)]
    const [x, y] = raw
    const close = x === y || Math.abs(x - y) <= Math.max(eps, 0.02 * Math.max(Math.abs(x), Math.abs(y)))
    const winner = close ? null : (better === 'high' ? x > y : x < y) ? 0 : 1
    rows.push({ label, about, raw, values: [fmt(x), fmt(y)], winner })
  }
  const after = (r: Run) => r.history.filter((s) => s.t > 1) // skip the first second while queues fill
  const max = (xs: number[]) => Math.max(0, ...xs)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0)

  add('peak throughput', 'most requests served per second', (r) => max(after(r).map((s) => s.thr)), fmtRps, 'high', 1)
  add('worst p99', 'highest p99 latency during the run', (r) => max(after(r).map((s) => s.p99)), fmtMs, 'low', 1)
  add('errors', 'share of requests that failed, over the whole run', (r) => mean(after(r).map((s) => s.err)), fmtPct, 'low', 0.05)
  if (te !== null) {
    add('recovery time', `seconds from the first failure or change (${te} s) until p99 and errors are back to normal`,
      (r) => recovery(r.history, te), (n) => (Number.isFinite(n) ? `${n.toFixed(1)} s` : 'not recovered'), 'low', 0.5)
  }
  if (a.history.some((s) => s.hit !== undefined) && b.history.some((s) => s.hit !== undefined)) {
    add('lowest cache hit', 'lowest hit ratio of the swapped cache (it drops when keys are lost)',
      (r) => Math.min(...r.history.filter((s) => s.t > 1).map((s) => s.hit ?? 0)), (n) => `${Math.round(n * 100)}%`, 'high', 0.005)
  }
  if (Math.max(...a.history.map((s) => s.backlog), ...b.history.map((s) => s.backlog)) >= 100) {
    add('peak backlog', 'most messages (or requests) waiting in one block', (r) => max(r.history.map((s) => s.backlog)), fmtCount, 'low', 10)
    add('backlog at end', 'what is still waiting when the scenario ends', (r) => r.history.at(-1)?.backlog ?? 0, fmtCount, 'low', 10)
  }
  add('cost', 'average $/hour, per-request pricing included', (r) => mean(after(r).map((s) => s.cost)), (n) => `$${n.toFixed(2)}/hr`, 'low', 0.005)
  return rows
}

/** Seconds after `te` until the last unhealthy sample, compared with the sample just before `te`:
 *  unhealthy = errors up more than 1 point, or p99 more than doubled (and up 50 ms+). */
export function recovery(h: Sample[], te: number) {
  const base = [...h].reverse().find((s) => s.t <= te + 1e-9) ?? h[0]
  if (!base) return 0
  const bad = (s: Sample) => s.err > base.err + 1 || s.p99 > Math.max(2 * base.p99, base.p99 + 50)
  const last = h.at(-1)
  if (last && bad(last)) return Infinity
  const lastBad = [...h].reverse().find((s) => s.t > te && bad(s))
  return lastBad ? lastBad.t - te : 0
}
