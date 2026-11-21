// The simulator core: one tick = forward pass (push flows from clients downstream),
// backward pass (end-to-end latency and failure share, from the leaves up), then sampling
// for p50/p99. Pure: step(design, previous state, inputs) -> next state.
// Per-block logic lives in ./handlers; this file never needs to change for a new block.
import { registry } from '../blocks'
import type { Design } from '../design'
import { handlers } from './handlers'
import { NONE, total } from './handlers/common'
import type { Fanout, Flow, HandlerOutput, NodeMetrics, NodeState, SimNode, Traffic } from './types'

// Extra latency on an edge between two regions / two AZs. Estimates: ~70 ms is a typical
// US east-west round trip; cross-AZ is about 1 ms.
export const CROSS_REGION_MS = 70
export const CROSS_AZ_MS = 1
const SAMPLES_PER_TICK = 100
const SAMPLE_WINDOW = 2000 // last 20 ticks = 2 s of sim time

export type PathMetrics = NodeMetrics & { pathMs: number; pathFail: number }
export type GlobalMetrics = {
  offered: number     // rps users send (before retries)
  throughput: number  // rps users get answered
  errorPct: number    // share of user requests that fail even after retries
  p50Ms: number
  p99Ms: number
  costHr: number
}
export type SimState = {
  t: number                          // sim time, seconds
  seed: number                       // random generator state, so runs are reproducible
  nodes: Record<string, NodeState>   // handler state per node
  metrics: Record<string, PathMetrics>
  edges: Record<string, number>      // rps per edge
  cut: string[]                      // edges crossing a partitioned region's border
  samples: number[]                  // recent end-to-end latency samples (ms)
  global: GlobalMetrics
}
export type SimInputs = { traffic: Traffic; killed: string[]; partitioned?: string[] }

export const initialSim = (): SimState => ({
  t: 0, seed: 1, nodes: {}, metrics: {}, edges: {}, cut: [], samples: [],
  global: { offered: 0, throughput: 0, errorPct: 0, p50Ms: 0, p99Ms: 0, costHr: 0 },
})

const behavior = (type: string) => registry[type]?.simBehavior
type Link = { target: string; w: number; edgeMs: number; cut: boolean }

export function step(design: Design, prev: SimState, { traffic, killed, partitioned = [] }: SimInputs, dt = 0.1): SimState {
  const byId = new Map(design.nodes.map((n) => [n.id, n]))
  const dead = new Set(killed)
  // Walk up the parent chain (block -> AZ -> region).
  const ancestors = (id: string) => {
    const out = []
    for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.push(cur)
    return out
  }
  const groupOf = (id: string, type: string) => ancestors(id).find((n) => n.type === type)?.id
  const edgeMs = (a: string, b: string) => {
    const [ra, rb] = [groupOf(a, 'region'), groupOf(b, 'region')]
    if (ra && rb && ra !== rb) return CROSS_REGION_MS
    const [za, zb] = [groupOf(a, 'az'), groupOf(b, 'az')]
    return za && zb && za !== zb ? CROSS_AZ_MS : 0
  }

  // Blocks with a handler take part; regions and AZs are only containers.
  // Killing a region or AZ kills everything inside it.
  const nodes = new Map<string, SimNode>()
  for (const n of design.nodes) {
    if (!handlers[behavior(n.type)]) continue
    nodes.set(n.id, { id: n.id, type: n.type, params: n.params, killed: ancestors(n.id).some((a) => dead.has(a.id)) })
  }
  const order = topoOrder([...nodes.keys()], design.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)))
  const pos = new Map(order.map((id, i) => [id, i]))
  // ponytail: edges that close a cycle are ignored; a real retry/callback loop would need iteration.
  const kids = new Map<string, { id: string; target: string }[]>(order.map((id) => [id, []]))
  for (const e of design.edges) {
    if (pos.has(e.source) && pos.has(e.target) && pos.get(e.source)! < pos.get(e.target)!) kids.get(e.source)!.push(e)
  }

  // A partitioned region's border cuts every edge with exactly one end inside it. The sender sees
  // the other side as down (load balancers route around it); nothing sent across arrives.
  const inside = (id: string, region: string) => ancestors(id).some((a) => a.id === region)
  const cut = new Set(design.edges
    .filter((e) => partitioned.some((r) => inside(e.source, r) !== inside(e.target, r))).map((e) => e.id))

  // Forward pass.
  const sources = order.filter((id) => behavior(nodes.get(id)!.type) === 'client')
  const share = sources.length ? (traffic.rps * traffic.multiplier) / sources.length : 0
  const inbound = new Map<string, Flow>()
  const results = new Map<string, HandlerOutput>()
  const edges: Record<string, number> = {}
  const nextNodes: Record<string, NodeState> = {}
  for (const id of order) {
    const node = nodes.get(id)!
    const children = kids.get(id)!
    const r = handlers[behavior(node.type)]({
      node, inbound: inbound.get(id) ?? NONE, children: children.map((e) => cut.has(e.id) ? { ...nodes.get(e.target)!, killed: true } : nodes.get(e.target)!),
      state: prev.nodes[id] ?? {}, prevPathFail: prev.metrics[id]?.pathFail ?? 0,
      offered: sources.includes(id) ? share : 0, readRatio: traffic.readRatio, dt,
    })
    children.forEach((e, i) => {
      const f = r.out[i], acc = inbound.get(e.target) ?? NONE
      edges[e.id] = total(f)
      if (!cut.has(e.id)) inbound.set(e.target, { read: acc.read + f.read, write: acc.write + f.write })
    })
    results.set(id, r)
    nextNodes[id] = r.state
  }

  // Backward pass: latency and failure share seen from each node, leaves first.
  const metrics: Record<string, PathMetrics> = {}
  const links = new Map<string, Link[]>()
  for (const id of [...order].reverse()) {
    const r = results.get(id)!, m = r.metrics, node = nodes.get(id)!
    const own = m.lambda > 0 ? Math.min(1, m.dropped / m.lambda) : node.killed ? 1 : 0
    const ls: Link[] = r.fanout === 'async' ? [] : kids.get(id)!.map((e, i) => ({
      target: e.target, edgeMs: edgeMs(id, e.target), cut: cut.has(e.id),
      w: m.served > 0 ? Math.min(1, total(r.out[i]) / m.served) : 0,
    }))
    links.set(id, ls)
    let downMs = 0, downFail = 0, survive = 1
    for (const l of ls) {
      const c = l.cut ? { pathMs: 0, pathFail: 1 } : metrics[l.target]
      downMs += l.w * (c.pathMs + l.edgeMs)
      downFail += l.w * c.pathFail
      survive *= 1 - l.w * c.pathFail
    }
    if (r.fanout === 'all') downFail = 1 - survive
    // A node gives up on downstream calls slower than its timeout (exponential tail estimate).
    const timeout = node.params.timeout_ms
    if (typeof timeout === 'number' && downMs > 0) downFail += (1 - downFail) * Math.exp(-timeout / downMs)
    metrics[id] = { ...m, pathMs: m.latencyMs + downMs, pathFail: Math.min(1, own + (1 - own) * downFail) }
  }

  // Sample end-to-end latencies for p50/p99.
  const rand = rng(prev.seed)
  const fanout = (id: string): Fanout => results.get(id)!.fanout
  const sample = (id: string, depth: number): number => {
    const m = metrics[id]
    // Base latency jitters ±25%; the queueing part is exponential. Estimate of the shape.
    let t = m.baseMs * (0.75 + 0.5 * rand.next()) - Math.max(0, m.latencyMs - m.baseMs) * Math.log(1 - rand.next())
    if (depth > 30) return t
    if (fanout(id) === 'one') {
      let u = rand.next()
      for (const l of links.get(id)!) if ((u -= l.w) < 0) { if (!l.cut) t += l.edgeMs + sample(l.target, depth + 1); break }
    } else {
      for (const l of links.get(id)!) if (rand.next() < l.w && !l.cut) t += l.edgeMs + sample(l.target, depth + 1)
    }
    return t
  }
  let offered = 0, failed = 0
  const fresh: number[] = []
  for (const id of sources) {
    const src = results.get(id)!.source!
    offered += src.offered
    failed += src.offered * metrics[id].pathFail ** (src.retries + 1)
  }
  for (const id of sources) {
    const n = offered > 0 ? Math.round((SAMPLES_PER_TICK * results.get(id)!.source!.offered) / offered) : 0
    for (let i = 0; i < n; i++) fresh.push(sample(id, 0))
  }
  const samples = offered > 0 ? [...prev.samples, ...fresh].slice(-SAMPLE_WINDOW) : []
  const sorted = [...samples].sort((a, b) => a - b)
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)

  return {
    t: prev.t + dt, seed: rand.seed, nodes: nextNodes, metrics, edges, cut: [...cut], samples,
    global: {
      offered, throughput: offered - failed, errorPct: offered > 0 ? (100 * failed) / offered : 0,
      p50Ms: pct(0.5), p99Ms: pct(0.99), costHr: costPerHour(design),
    },
  }
}

/** $/hour: block cost × replicas (SQL: primary + read replicas). */
export function costPerHour(design: Design) {
  let sum = 0
  for (const n of design.nodes) {
    const def = registry[n.type]
    if (!def) continue
    const count = (typeof n.params.replicas === 'number' ? n.params.replicas : 1)
      * (1 + (typeof n.params.read_replicas === 'number' ? n.params.read_replicas : 0))
    sum += def.cost * count
  }
  return sum
}

/** Kahn's algorithm. Nodes stuck in a cycle go last, in input order. */
function topoOrder(ids: string[], edges: { source: string; target: string }[]) {
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const e of edges) indeg.set(e.target, indeg.get(e.target)! + 1)
  const ready = ids.filter((id) => indeg.get(id) === 0)
  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    for (const e of edges) if (e.source === id) {
      indeg.set(e.target, indeg.get(e.target)! - 1)
      if (indeg.get(e.target) === 0) ready.push(e.target)
    }
  }
  return [...order, ...ids.filter((id) => !order.includes(id))]
}

/** Small seeded random generator (mulberry32), so the same inputs give the same run. */
function rng(seed: number) {
  let s = seed >>> 0
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    get seed() { return s },
  }
}
