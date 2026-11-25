// The simulator core: one tick = forward pass (push flows from clients downstream),
// backward pass (end-to-end latency and failure share, from the leaves up), then sampling
// for p50/p99. Pure: step(design, previous state, inputs) -> next state.
// Per-block logic lives in ./handlers; this file never needs to change for a new block.
import { registry } from '../blocks'
import type { ParamValue } from '../blocks/types'
import type { Design, SavedEdge } from '../design'
import { handlers } from './handlers'
import { CROSS_AZ_MS, CROSS_REGION_MS, failAll, NONE, num, total } from './handlers/common'
import { TRAFFIC_DEFAULTS, type Fanout, type Flow, type HandlerOutput, type NodeMetrics, type NodeState, type SimNode, type Traffic } from './types'

export const TICK_S = 0.1 // seconds of sim time per step; the app runs 10 steps per second in real time
const SAMPLES_PER_TICK = 100
const SAMPLE_WINDOW = 2000 // last 20 ticks = 2 s of sim time

// pathFail: share of requests from here that fail end to end. pathStuck: the part of it that fails
// on every retry too (a dead target); the rest (overload, timeouts) is retried as independent tries.
export type PathMetrics = NodeMetrics & { pathMs: number; pathFail: number; pathStuck: number }
export type GlobalMetrics = {
  offered: number     // rps users send (before retries)
  throughput: number  // rps users get answered
  errorPct: number    // share of user requests that fail even after retries
  p50Ms: number
  p99Ms: number
  costHr: number
  stalePct: number    // share of user reads answered from a copy that may lag (cache hits, read replicas)
  fanoutRps: number   // extra rps created by fan-out edges (0 = nothing fans out)
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
// replicasDown: how many replicas of a block are dead (block id -> count); the rest keep serving.
// primaryDown: SQL blocks whose primary is dead.
export type SimInputs = { traffic: Traffic; killed: string[]; partitioned?: string[]; replicasDown?: Record<string, number>; primaryDown?: string[] }

/** Replicas still up, or undefined for a block with no `replicas` param. 0 = the block is down (same as killed). */
export function liveReplicas(params: Record<string, ParamValue>, dead = 0) {
  return params.replicas === undefined ? undefined : Math.max(0, num(params.replicas, 1) - dead)
}

export const initialSim = (): SimState => ({
  t: 0, seed: 1, nodes: {}, metrics: {}, edges: {}, cut: [], samples: [],
  global: { offered: 0, throughput: 0, errorPct: 0, p50Ms: 0, p99Ms: 0, costHr: 0, stalePct: 0, fanoutRps: 0 },
})

const behavior = (type: string) => registry[type]?.simBehavior
// sequentialCalls: calls per request that wait one after another (a sequential fan-out edge); 1 otherwise.
const CUT = { pathMs: 0, pathFail: 1, pathStuck: 1 } // what a sender sees across a cut edge
type Link = { target: string; w: number; edgeMs: number; cut: boolean; sequentialCalls: number }

export function step(design: Design, prev: SimState, { traffic, killed, partitioned = [], replicasDown = {}, primaryDown = [] }: SimInputs, dt = TICK_S): SimState {
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
    // Dead replicas leave the block with fewer replicas, so every handler sees the smaller μ. All dead = killed.
    const alive = liveReplicas(n.params, replicasDown[n.id])
    nodes.set(n.id, {
      id: n.id, type: n.type, params: alive === undefined || alive === n.params.replicas ? n.params : { ...n.params, replicas: Math.max(1, alive) },
      killed: alive === 0 || ancestors(n.id).some((a) => dead.has(a.id)),
      ...(primaryDown.includes(n.id) ? { primaryDown: true } : {}),
    })
  }
  const order = topoOrder([...nodes.keys()], design.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)))
  const pos = new Map(order.map((id, i) => [id, i]))
  // ponytail: edges that close a cycle are ignored; a real retry/callback loop would need iteration.
  const kids = new Map<string, SavedEdge[]>(order.map((id) => [id, []]))
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
  const routed = new Map<string, Flow[]>() // per node, per child: what each request sends (before fan-out)
  let fanoutRps = 0
  const edges: Record<string, number> = {}
  const nextNodes: Record<string, NodeState> = {}
  for (const id of order) {
    const node = nodes.get(id)!
    const children = kids.get(id)!
    const r = handlers[behavior(node.type)]({
      node, inbound: inbound.get(id) ?? NONE, children: children.map((e) => cut.has(e.id) ? { ...nodes.get(e.target)!, killed: true } : nodes.get(e.target)!),
      state: prev.nodes[id] ?? {}, prevPathFail: prev.metrics[id]?.pathFail ?? 0, prevPathStuck: prev.metrics[id]?.pathStuck ?? 0,
      childFail: children.map((e) => (cut.has(e.id) ? 1 : prev.metrics[e.target]?.pathFail ?? 0)),
      offered: sources.includes(id) ? share : 0, readRatio: traffic.readRatio, hotKey: traffic.hotKey ?? 0, dt,
    })
    // An edge can carry only reads or only writes, and can fan out: each write becomes `followers`
    // copies, or each read gathers from `following` sources.
    // A parallel fan-out's N calls count as one call for latency; a sequential one (edge.sequential)
    // waits for each in turn: N × the latency, and it fails if any of the N calls fails.
    const sent = children.map((e, i) => route(r.out[i], e))
    routed.set(id, sent)
    children.forEach((e, i) => {
      const f = fan(sent[i], e, traffic), acc = inbound.get(e.target) ?? NONE
      fanoutRps += total(f) - total(sent[i])
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
    const ownStuck = node.killed ? own : m.lambda > 0 ? Math.min(own, (m.stuck ?? 0) / m.lambda) : 0
    const ls: Link[] = r.fanout === 'async' ? [] : kids.get(id)!.map((e, i) => ({
      target: e.target, edgeMs: edgeMs(id, e.target), cut: cut.has(e.id), sequentialCalls: sequentialCalls(e, traffic),
      w: m.served > 0 ? Math.min(1, total(routed.get(id)![i]) / m.served) : 0,
    }))
    links.set(id, ls)
    const below = (l: Link) => l.cut ? CUT : metrics[l.target]
    // Share of requests failing downstream: weighted by traffic, or for fan-out to all, any call failing.
    // Used for every failure and for the stuck part (dead targets and cut edges only).
    const downShare = (share: (c: typeof CUT) => number) => {
      let sum = 0, survive = 1
      for (const l of ls) {
        const p = 1 - (1 - share(below(l))) ** l.sequentialCalls
        sum += l.w * p
        survive *= 1 - l.w * p
      }
      return r.fanout === 'all' ? 1 - survive : sum
    }
    const downMs = ls.reduce((ms, l) => ms + l.w * (below(l).pathMs + l.edgeMs) * l.sequentialCalls, 0)
    let downFail = downShare((c) => c.pathFail)
    const downStuck = downShare((c) => c.pathStuck)
    // A node gives up on downstream calls slower than its timeout (exponential tail estimate).
    const timeout = node.params.timeout_ms
    if (typeof timeout === 'number' && downMs > 0) downFail += (1 - downFail) * Math.exp(-timeout / downMs)
    const pathFail = Math.min(1, own + (1 - own) * downFail)
    metrics[id] = { ...m, pathMs: m.latencyMs + downMs, pathFail, pathStuck: Math.min(pathFail, ownStuck + (1 - ownStuck) * downStuck) }
  }

  // Sample end-to-end latencies for p50/p99.
  const rand = rng(prev.seed)
  const fanout = (id: string): Fanout => results.get(id)!.fanout
  // One call down a link, or `sequentialCalls` calls in a row (up to 20 samples, scaled, to bound the work).
  const calls = (l: Link, depth: number) => {
    const k = Math.min(l.sequentialCalls, 20)
    let sum = 0
    for (let i = 0; i < k; i++) sum += l.edgeMs + sample(l.target, depth + 1)
    return (sum * l.sequentialCalls) / k
  }
  const sample = (id: string, depth: number): number => {
    const m = metrics[id]
    // Base latency jitters ±25%; the queueing part is exponential. Estimate of the shape.
    let t = m.baseMs * (0.75 + 0.5 * rand.next()) - Math.max(0, m.latencyMs - m.baseMs) * Math.log(1 - rand.next())
    if (depth > 30) return t
    if (fanout(id) === 'one') {
      let u = rand.next()
      for (const l of links.get(id)!) if ((u -= l.w) < 0) { if (!l.cut) t += calls(l, depth); break }
    } else {
      for (const l of links.get(id)!) if (rand.next() < l.w && !l.cut) t += calls(l, depth)
    }
    return t
  }
  let offered = 0, failed = 0, userReads = 0
  const fresh: number[] = []
  for (const id of sources) {
    const src = results.get(id)!.source!
    offered += src.offered
    userReads += results.get(id)!.metrics.served * traffic.readRatio
    // A failed request is retried (if the budget allows it) and fails for good only if every retry fails too:
    // always for the stuck part, as independent tries for the rest.
    // Retries go out with the same read/write mix as new requests, so these shares hold per new request.
    const { pathFail: p, pathStuck: s } = metrics[id]
    failed += src.offered * ((1 - src.retryShare) * p + src.retryShare * failAll(p, s, src.retries + 1))
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
      stalePct: userReads > 0 ? Math.min(100, (100 * Object.values(metrics).reduce((a, m) => a + (m.stale ?? 0), 0)) / userReads) : 0,
      fanoutRps,
      p50Ms: pct(0.5), p99Ms: pct(0.99), costHr: costPerHour(design) + requestCostPerHour(design, inbound, traffic.payloadKb ?? TRAFFIC_DEFAULTS.payloadKb),
    },
  }
}

/** How many copies a fan-out edge makes of each write (followers) or read (following); 1 if it doesn't fan out. */
const fanFactor = (e: SavedEdge, t: Traffic) =>
  e.fanout === 'write' ? (t.followers ?? TRAFFIC_DEFAULTS.followers) : e.fanout === 'read' ? (t.following ?? TRAFFIC_DEFAULTS.following) : 1
const sequentialCalls = (e: SavedEdge, t: Traffic) => (e.sequential ? Math.max(1, fanFactor(e, t)) : 1)
const route = (f: Flow, e: SavedEdge): Flow =>
  e.carries === 'read' ? { read: f.read, write: 0 } : e.carries === 'write' ? { read: 0, write: f.write } : f
const fan = (f: Flow, e: SavedEdge, t: Traffic): Flow =>
  e.fanout === 'write' ? { ...f, write: f.write * fanFactor(e, t) } : e.fanout === 'read' ? { ...f, read: f.read * fanFactor(e, t) } : f

/** $/hour for running the blocks: cost × replicas (SQL: primary + read replicas; × 2 with a
 *  replica per node; per partition for blocks billed per shard). Request pricing is separate. */
export function costPerHour(design: Design) {
  let sum = 0
  for (const n of design.nodes) {
    const def = registry[n.type]
    if (!def) continue
    const p = n.params, num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
    const count = def.costPer === 'partition' ? num(p.partitions, 1)
      : num(p.replicas, 1) * (1 + num(p.read_replicas, 0)) * (p.replication === 'replica' ? 2 : 1)
    sum += def.cost * count
  }
  return sum
}

/** $/hour for per-request pricing (SQS, DynamoDB on-demand, S3) and per-GB transfer (CloudFront)
 *  at the current request rates. */
function requestCostPerHour(design: Design, inbound: Map<string, Flow>, payloadKb: number) {
  let sum = 0
  for (const n of design.nodes) {
    const def = registry[n.type], f = inbound.get(n.id)
    if (!def || !f) continue
    if (def.requestCost) sum += ((f.read * def.requestCost.read + f.write * def.requestCost.write) * 3600) / 1e6
    if (def.transferCost) sum += ((f.read * payloadKb * 3600) / 1e6) * def.transferCost // KB/s -> GB/hr
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
