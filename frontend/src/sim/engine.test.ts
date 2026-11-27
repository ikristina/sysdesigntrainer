import { describe, expect, it } from 'vitest'
import { defaultParams, registry } from '../blocks'
import type { Design, SavedNode } from '../design'
import { initialSim, step } from './engine'
import { CROSS_REGION_MS, erlangC } from './handlers/common'

const node = (id: string, type: string, params: Record<string, number | string> = {}, parentId?: string): SavedNode =>
  ({ id, type, position: { x: 0, y: 0 }, parentId, params: { ...defaultParams(type), ...params } })
const design = (nodes: SavedNode[], links: [string, string][]): Design =>
  ({ version: 1, nodes, edges: links.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) })
const run = (d: Design, { rps = 1000, readRatio = 0.9, killed = [] as string[], partitioned = [] as string[], seconds = 5, hotKey = 0, from = initialSim() } = {}) => {
  let s = from
  for (let i = 0; i < seconds * 10; i++) s = step(d, s, { traffic: { rps, readRatio, multiplier: 1, hotKey }, killed, partitioned })
  return s
}
// client -> one service (2 × 1000 rps, 20 ms) by default
const simple = (svc: Record<string, number> = {}, client: Record<string, number> = {}) =>
  design([node('c', 'client', client), node('s', 'service', svc)], [['c', 's']])

describe('simulator', () => {
  it('under capacity: ρ = λ/μ, no errors, many parallel servers barely queue', () => {
    const s = run(simple(), { rps: 1000 })
    expect(s.metrics.s.rho).toBeCloseTo(0.5)
    expect(s.metrics.s.queue).toBe(0)
    expect(s.global.errorPct).toBeCloseTo(0)
    expect(s.metrics.s.latencyMs).toBeCloseTo(20, 0) // 2 × 1000 rps × 20 ms = 40 servers: no wait at ρ 0.5
    expect(s.global.p50Ms).toBeGreaterThan(15)
    expect(s.global.p50Ms).toBeLessThan(80)
    expect(s.global.throughput).toBeCloseTo(1000)
  })

  it('M/M/c: one server queues early (base / (1 - ρ)); many servers wait only near full; replicas queue separately', () => {
    const one = run(simple({ replicas: 1, capacity_rps: 50 }, { retries: 0 }), { rps: 40 }) // 50 rps × 20 ms = 1 server
    expect(one.metrics.s.latencyMs).toBeCloseTo(20 / (1 - 0.8), 0)
    // 10 replicas × 20 servers each. Each replica has its own queue, so they don't pool into 200.
    const many = (rps: number) => run(simple({ replicas: 10 }, { retries: 0 }), { rps }).metrics.s.latencyMs
    expect(many(5000)).toBeLessThan(21)
    expect(many(9900)).toBeGreaterThan(22)
    expect(many(8000)).toBeGreaterThan(run(simple({ replicas: 1, capacity_rps: 10000 }, { retries: 0 }), { rps: 8000 }).metrics.s.latencyMs)
    // μ × base < 1: one server that takes 1/μ = 200 ms per request, not the 20 ms base.
    const slow = run(simple({ replicas: 1, capacity_rps: 5 }, { retries: 0 }), { rps: 4 })
    expect(slow.metrics.s.latencyMs).toBeCloseTo(20 + (0.8 * 200) / 0.2, 0)
  })

  it('erlangC matches known values', () => {
    expect(erlangC(1, 0.8)).toBeCloseTo(0.8)        // M/M/1: P(wait) = ρ
    expect(erlangC(2, 1)).toBeCloseTo(1 / 3)        // c = 2, a = 1
    expect(erlangC(10, 8)).toBeCloseTo(0.409, 2)    // standard table value
  })

  it('overloaded: the queue grows, then requests past the timeout fail', () => {
    const s = run(simple({}, { retries: 0 }), { rps: 3000, seconds: 10 })
    expect(s.metrics.s.rho).toBeCloseTo(1.5)
    expect(s.metrics.s.queue).toBeCloseTo(2000) // capped at μ × 1 s timeout
    expect(s.global.errorPct).toBeGreaterThan(30)
  })

  it('retries add load when things fail (retry storm)', () => {
    const calm = run(simple({}, { retries: 0 }), { rps: 3000, seconds: 10 })
    const storm = run(simple({}, { retries: 3 }), { rps: 3000, seconds: 10 })
    expect(storm.metrics.s.lambda).toBeGreaterThan(calm.metrics.s.lambda * 1.3)
  })

  it('a retry budget caps retries at a share of requests; the rest fail at once', () => {
    const storm = run(simple({}, { retries: 3 }), { rps: 3000, seconds: 10 })
    const budget = run(design([node('c', 'client', { retries: 3, retry_budget: '10%' }), node('s', 'service')], [['c', 's']]), { rps: 3000, seconds: 10 })
    expect(budget.metrics.c.lambda).toBeLessThanOrEqual(3000 * 1.1 + 1)
    expect(budget.metrics.c.lambda).toBeLessThan(storm.metrics.c.lambda)
  })

  it('backoff spreads retries over later ticks instead of sending them at once', () => {
    const d = (backoff: string) => design([node('c', 'client', { retries: 3, backoff }), node('s', 'service')], [['c', 's']])
    // One second of total failure, then the service is back: retries keep arriving only with backoff.
    const kill = (b: string) => run(d(b), { rps: 1000, seconds: 1, killed: ['s'] })
    const after = (b: string) => run(d(b), { rps: 1000, seconds: 0.5, from: kill(b) })
    expect(kill('exponential').metrics.c.lambda).toBeLessThan(kill('none').metrics.c.lambda)
    expect(after('exponential').metrics.c.lambda).toBeGreaterThan(1000 * 1.05) // late retries still landing
    expect(after('none').metrics.c.lambda).toBeCloseTo(1000, -1)
  })

  it('a sequential fan-out edge waits for each call in turn: latency × N', () => {
    const d = (sequential: boolean) => ({ version: 1 as const,
      nodes: [node('c', 'client', { timeout_ms: 10000 }), node('api', 'service', { replicas: 10, timeout_ms: 10000 }), node('llm', 'service', { replicas: 50, base_latency_ms: 100 })],
      edges: [{ id: 'c-api', source: 'c', target: 'api' }, { id: 'api-llm', source: 'api', target: 'llm', fanout: 'read' as const, sequential }] })
    const go = (seq: boolean) => { let s = initialSim(); for (let i = 0; i < 30; i++) s = step(d(seq), s, { traffic: { rps: 100, readRatio: 1, multiplier: 1, following: 6 }, killed: [] }); return s }
    const par = go(false), seq = go(true)
    expect(seq.metrics.llm.lambda).toBeCloseTo(par.metrics.llm.lambda) // same load either way
    expect(seq.metrics.api.pathMs - seq.metrics.api.latencyMs).toBeCloseTo(6 * (par.metrics.api.pathMs - par.metrics.api.latencyMs))
    expect(seq.global.p50Ms).toBeGreaterThan(4 * par.global.p50Ms)
  })

  it('cache absorbs reads but not writes', () => {
    const d = design([node('c', 'client'), node('api', 'service', { replicas: 10 }),
      node('cache', 'cache', { hit_ratio: 0.9, write_mode: 'write-through' }), node('db', 'sql_db')],
    [['c', 'api'], ['api', 'cache'], ['cache', 'db']])
    const s = run(d, { rps: 1000, readRatio: 0.9 })
    // 900 reads × 10% misses + 100 writes
    expect(s.metrics.db.lambda).toBeCloseTo(190)
  })

  it('invalidate mode lowers the hit ratio as writes grow', () => {
    const d = (mode: string) => design([node('c', 'client'), node('cache', 'cache', { hit_ratio: 0.9, write_mode: mode }), node('db', 'kv')],
      [['c', 'cache'], ['cache', 'db']])
    const inv = run(d('invalidate'), { readRatio: 0.5 })
    const wt = run(d('write-through'), { readRatio: 0.5 })
    expect(inv.metrics.db.lambda).toBeGreaterThan(wt.metrics.db.lambda)
  })

  it('load balancer splits evenly and skips killed backends', () => {
    const d = design([node('c', 'client'), node('lb', 'load_balancer'), node('a', 'service'), node('b', 'service')],
      [['c', 'lb'], ['lb', 'a'], ['lb', 'b']])
    expect(run(d).metrics.a.lambda).toBeCloseTo(500)
    const s = run(d, { killed: ['a'] })
    expect(s.metrics.a.lambda).toBe(0)
    expect(s.metrics.b.lambda).toBeCloseTo(1000)
    expect(s.global.errorPct).toBeCloseTo(0)
  })

  it('gateway splits reads and writes by share over the edges that carry them', () => {
    const d = design([node('c', 'client', { retries: 0 }), node('gw', 'api_gateway'), node('api', 'service'), node('q', 'kafka')],
      [['c', 'gw'], ['gw', 'api'], ['gw', 'q']])
    d.edges[2] = { ...d.edges[2], carries: 'write', share: 90 }
    const s = run(d, { readRatio: 0.4 }) // 400 reads, 600 writes
    expect(s.metrics.api.lambda).toBeCloseTo(400 + 60) // every read, 10% of writes
    expect(s.metrics.q.lambda).toBeCloseTo(540)
    expect(s.global.errorPct).toBeCloseTo(0)
    d.edges.splice(1, 1) // only the writes edge left: reads have nowhere to go and fail
    expect(run(d, { readRatio: 0.4 }).global.errorPct).toBeCloseTo(40)
  })

  it('dead replicas shrink μ; all dead = killed', () => {
    const d = simple({ replicas: 4, capacity_rps: 100 }, { retries: 0 })
    const go = (n: number) => { let s = initialSim(); for (let i = 0; i < 50; i++) s = step(d, s, { traffic: { rps: 350, readRatio: 0.9, multiplier: 1 }, killed: [], replicasDown: { s: n } }); return s }
    expect(go(0).metrics.s.rho).toBeCloseTo(0.875)
    expect(go(1).metrics.s.mu).toBeCloseTo(300) // N+1: lose one of 4 and 350 rps no longer fits
    expect(go(1).metrics.s.rho).toBeGreaterThan(1)
    expect(go(4).global.errorPct).toBeCloseTo(100)
  })

  it('SQL primary down: writes fail, read replicas keep serving reads', () => {
    const d = (r: number) => design([node('c', 'client', { retries: 0 }), node('db', 'sql_db', { read_replicas: r })], [['c', 'db']])
    const go = (r: number) => { let s = initialSim(); for (let i = 0; i < 20; i++) s = step(d(r), s, { traffic: { rps: 1000, readRatio: 0.9, multiplier: 1 }, killed: [], primaryDown: ['db'] }); return s }
    expect(go(2).metrics.db.dropped).toBeCloseTo(100) // the writes
    expect(go(2).global.errorPct).toBeCloseTo(10)
    expect(go(2).metrics.db.note).toBe('primary down')
    expect(go(0).global.errorPct).toBeCloseTo(100) // no replicas: same as killing it
  })

  it('retries hide random failures, not a dead target', () => {
    // Client (3 retries) -> service -> cache (hit 0.9) -> DB. Kill the DB: every miss fails on every retry.
    const d = design([node('c', 'client', { retries: 3 }), node('s', 'service', { replicas: 4 }), node('k', 'cache', { hit_ratio: 0.9 }), node('db', 'sql_db')],
      [['c', 's'], ['s', 'k'], ['k', 'db']])
    const s = run(d, { rps: 1000, readRatio: 1, killed: ['db'] })
    expect(s.metrics.c.pathStuck).toBeCloseTo(0.1)
    expect(s.global.errorPct).toBeCloseTo(10)
  })

  it('a killed node fails everything sent to it', () => {
    const s = run(simple({}, { retries: 0 }), { killed: ['s'] })
    expect(s.global.errorPct).toBeCloseTo(100)
  })

  it('gateway drops traffic above its rate limit', () => {
    const d = design([node('c', 'client', { retries: 0 }), node('gw', 'api_gateway', { rate_limit_rps: 600 }), node('s', 'service')],
      [['c', 'gw'], ['gw', 's']])
    const s = run(d, { rps: 1000 })
    expect(s.metrics.s.lambda).toBeCloseTo(600)
    expect(s.global.errorPct).toBeCloseTo(40)
  })

  it('SQL: writes hit the primary only, and replica lag grows while it is overloaded', () => {
    const d = design([node('c', 'client', { retries: 0 }), node('db', 'sql_db', { read_replicas: 2, capacity_rps: 1000 })], [['c', 'db']])
    const ok = run(d, { rps: 1500, readRatio: 0.9 }) // primary: 150 writes + 450 reads
    expect(ok.metrics.db.lagS).toBe(0)
    expect(ok.global.errorPct).toBeCloseTo(0)
    const hot = run(d, { rps: 1500, readRatio: 0.2, seconds: 10 }) // primary: 1200 writes + 100 reads
    expect(hot.metrics.db.lagS).toBeGreaterThan(3)
    expect(hot.global.errorPct).toBeGreaterThan(0)
  })

  it('connection pool caps SQL throughput', () => {
    const d = design([node('c', 'client', { retries: 0 }), node('db', 'sql_db', { pool_size: 2, base_latency_ms: 5 })], [['c', 'db']])
    expect(run(d, { rps: 1000 }).metrics.db.mu).toBeCloseTo(400) // 2 connections / 5 ms
  })

  it('queue: producer latency stays low while the backlog grows behind slow consumers', () => {
    const d = design([node('c', 'client'), node('q', 'queue'), node('w', 'worker', { replicas: 1, capacity_rps: 200 })],
      [['c', 'q'], ['q', 'w']])
    const s = run(d, { rps: 1000, seconds: 5 })
    expect(s.metrics.w.lambda).toBeCloseTo(200)
    expect(s.metrics.q.queue).toBeCloseTo(4000) // (1000 - 200) × 5 s
    expect(s.metrics.c.pathMs).toBeCloseTo(10) // just the enqueue
    expect(s.global.errorPct).toBeCloseTo(0)
  })

  it('queue: at least once: what a consumer fails on goes back on the queue, so throughput = what completes', () => {
    // Workers take 400/s, but the slow block behind them finishes only 100/s (timeout 100 ms: it can't buffer much).
    const d = design([node('c', 'client'), node('q', 'queue'), node('w', 'worker', { replicas: 2, timeout_ms: 2000 }),
      node('slow', 'service', { replicas: 1, capacity_rps: 100, base_latency_ms: 10, timeout_ms: 100 })],
    [['c', 'q'], ['q', 'w'], ['w', 'slow']])
    const s = run(d, { rps: 300, seconds: 10 })
    expect(s.metrics.q.redelivered).toBeGreaterThan(100)                // failed messages come back
    expect(s.metrics.q.queue).toBeGreaterThan(1500)                      // the shortfall shows up as backlog
    expect(s.metrics.slow.served).toBeCloseTo(100, -1)                   // real throughput = the slowest step
    expect(s.global.errorPct).toBeCloseTo(0)                             // producers never see it
    // ...unless redeliveries eat the queue's own intake limit: then new sends get turned away.
    const capped = design([node('c', 'client', { retries: 0 }), node('q', 'queue', { capacity_rps: 350 }), node('w', 'worker', { replicas: 2, timeout_ms: 2000 }),
      node('slow', 'service', { replicas: 1, capacity_rps: 100, base_latency_ms: 10, timeout_ms: 100 })],
    [['c', 'q'], ['q', 'w'], ['w', 'slow']])
    const t = run(capped, { rps: 300, seconds: 10 })
    expect(t.metrics.q.rho).toBeGreaterThan(1)
    expect(t.global.errorPct).toBeGreaterThan(1)
  })

  it('stream: every consumer group reads every message; partitions cap parallelism', () => {
    const d = design([node('c', 'client'), node('st', 'stream', { partitions: 2 }),
      node('g1', 'worker', { replicas: 4, capacity_rps: 200 }), node('g2', 'worker', { replicas: 1, capacity_rps: 1000 })],
    [['c', 'st'], ['st', 'g1'], ['st', 'g2']])
    const s = run(d, { rps: 600 })
    expect(s.metrics.g1.lambda).toBeCloseTo(400) // only 2 of 4 replicas get a partition
    expect(s.metrics.g2.lambda).toBeCloseTo(600) // keeps up, gets everything
  })

  it('stream: partitions split unevenly over fewer consumers; the busiest one falls behind', () => {
    const lag = (workers: number) => run(design([node('c', 'client'), node('st', 'stream', { partitions: 45, capacity_rps: 1000 }),
      node('w', 'worker', { replicas: workers, capacity_rps: 200 })], [['c', 'st'], ['st', 'w']]), { rps: 8000, seconds: 10 }).metrics.st.queue
    expect(lag(44)).toBeCloseTo(1556, -1) // one owner of 2 partitions: 356/s in, 200/s out
    expect(lag(45)).toBe(0)
  })

  it('cross-region edges add latency; killing a region kills what is inside', () => {
    const nodes = [node('east', 'region'), node('west', 'region'),
      node('c', 'client', {}, 'east'), node('s', 'service', { replicas: 100 }, 'west')]
    const d = design(nodes, [['c', 's']])
    const s = run(d)
    expect(s.metrics.c.pathMs - s.metrics.s.pathMs).toBeCloseTo(CROSS_REGION_MS)
    expect(run(d, { killed: ['west'] }).metrics.s.dropped).toBeGreaterThan(0)
  })

  it('partitioned region: the load balancer routes around it; a direct call across fails', () => {
    const nodes = [node('east', 'region'), node('west', 'region'), node('c', 'client', { retries: 0 }),
      node('lb', 'load_balancer'), node('a', 'service', {}, 'east'), node('b', 'service', {}, 'west')]
    const lb = run(design(nodes, [['c', 'lb'], ['lb', 'a'], ['lb', 'b']]), { partitioned: ['west'] })
    expect(lb.metrics.a.lambda).toBeCloseTo(1000)
    expect(lb.metrics.b.lambda).toBe(0)
    expect(lb.global.errorPct).toBeCloseTo(0)
    expect(lb.cut).toEqual(['lb-b'])

    const direct = run(design(nodes, [['c', 'a'], ['a', 'b']]), { partitioned: ['west'] })
    expect(direct.metrics.b.lambda).toBe(0) // nothing arrives
    expect(direct.global.errorPct).toBeCloseTo(100)
  })

  it('is deterministic', () => {
    expect(run(simple(), { rps: 1900 }).global).toEqual(run(simple(), { rps: 1900 }).global)
  })

  describe('cache warmth', () => {
    const d = (params: Record<string, number | string>) => design([node('c', 'client'), node('api', 'service', { replicas: 10 }),
      node('cache', 'cache', { hit_ratio: 0.9, write_mode: 'write-through', ...params }), node('db', 'kv')],
    [['c', 'api'], ['api', 'cache'], ['cache', 'db']])
    const restart = (p: Record<string, number | string>) => {
      const down = run(d(p), { from: run(d(p)), killed: ['cache'], seconds: 1 })
      return run(d(p), { from: down, seconds: 0.1 }).metrics.cache.hit ?? 0
    }

    it('a restart with persistence none comes back cold, rdb/aof keep the keys', () => {
      expect(restart({ persistence: 'none' })).toBeLessThan(0.01)
      expect(restart({ persistence: 'aof' })).toBeCloseTo(0.9)
    })

    it('when_down bypass: a dead cache sends everything on to the DB instead of failing it', () => {
      const down = (when_down: string) => run(d({ when_down }), { from: run(d({ when_down })), killed: ['cache'], seconds: 1 })
      expect(down('fail').global.errorPct).toBeGreaterThan(99)
      const bypass = down('bypass')
      expect(bypass.global.errorPct).toBeLessThan(0.1)
      expect(bypass.metrics.db.lambda).toBeCloseTo(1000) // every request, not just the 10% misses
    })

    it('warms back up over about 30 s', () => {
      const p = { persistence: 'none' }
      const down = run(d(p), { from: run(d(p)), killed: ['cache'], seconds: 1 })
      const hit = run(d(p), { from: down, seconds: 30 }).metrics.cache.hit ?? 0
      expect(hit).toBeGreaterThan(0.5)
      expect(hit).toBeLessThan(0.65) // 0.9 × (1 - 1/e)
    })

    it('removing a node loses its keys unless each node has a replica', () => {
      const shrink = (replication: string) =>
        run(d({ replicas: 3, replication }), { from: run(d({ replicas: 4, replication })), seconds: 0.1 }).metrics.cache.hit ?? 0
      expect(shrink('none')).toBeCloseTo(0.9 * 0.75, 1)
      expect(shrink('replica')).toBeCloseTo(0.9)
    })

    it('a replica per node doubles the cost', () => {
      expect(run(d({ replication: 'replica' }), { seconds: 0.1 }).global.costHr - run(d({}), { seconds: 0.1 }).global.costHr)
        .toBeCloseTo(registry.cache.cost)
    })
  })

  it('per-request pricing adds to cost/hr at the current rate', () => {
    registry.test_paid = { ...registry.kv, type: 'test_paid', cost: 0, requestCost: { read: 0.25, write: 1.25 } }
    const s = run(design([node('c', 'client'), node('t', 'test_paid')], [['c', 't']]), { rps: 1000, readRatio: 0.8, seconds: 1 })
    // (800 × 0.25 + 200 × 1.25) per million × 3600 s
    expect(s.global.costHr - registry.client.cost).toBeCloseTo(1.62)
  })

  it('per-GB transfer pricing uses read rps × payload size', () => {
    registry.test_egress = { ...registry.kv, type: 'test_egress', cost: 0, transferCost: 0.1 }
    const d = design([node('c', 'client'), node('t', 'test_egress')], [['c', 't']])
    let s = initialSim()
    s = step(d, s, { traffic: { rps: 1000, readRatio: 0.5, multiplier: 1, payloadKb: 20 }, killed: [] })
    // 500 reads/s × 20 KB × 3600 s = 36 GB/hr, × $0.10; writes aren't charged
    expect(s.global.costHr - registry.client.cost).toBeCloseTo(3.6)
  })

  it('edges can carry only reads or only writes, and fan out by followers / following', () => {
    const d: Design = { version: 1, nodes: [node('c', 'client'), node('api', 'service', { replicas: 100 }), node('posts', 'kv', { replicas: 100 }), node('feeds', 'kv', { replicas: 100 })],
      edges: [{ id: 'c-api', source: 'c', target: 'api' },
        { id: 'api-posts', source: 'api', target: 'posts', carries: 'write' },
        { id: 'api-feeds', source: 'api', target: 'feeds', fanout: 'write' }] }
    const step1 = (t: object) => step(d, initialSim(), { traffic: { rps: 1000, readRatio: 0.9, multiplier: 1, ...t }, killed: [] })
    const s = step1({ followers: 50 })
    expect(s.metrics.posts.lambda).toBeCloseTo(100)            // writes only
    expect(s.metrics.feeds.lambda).toBeCloseTo(900 + 100 * 50) // reads once, each write × 50 followers
    expect(s.global.fanoutRps).toBeCloseTo(100 * 49)
    d.edges[2].fanout = 'read'
    expect(step1({ following: 20 }).metrics.feeds.lambda).toBeCloseTo(900 * 20 + 100)
    expect(step1({}).global.fanoutRps).toBeGreaterThan(0) // defaults: 100 following
  })

  it('stale reads: read replicas and cache hits count, the primary does not', () => {
    const viaReplicas = run(design([node('c', 'client'), node('db', 'sql_db', { read_replicas: 3, capacity_rps: 100_000 })], [['c', 'db']]), { readRatio: 1, seconds: 1 })
    expect(viaReplicas.global.stalePct).toBeCloseTo(75) // 3 of 4 nodes serving reads are replicas
    const viaCache = run(design([node('c', 'client'), node('k', 'cache', { hit_ratio: 0.9 }), node('db', 'sql_db')], [['c', 'k'], ['k', 'db']]), { readRatio: 1, seconds: 1 })
    expect(viaCache.global.stalePct).toBeCloseTo(90)
    expect(run(design([node('c', 'client'), node('db', 'sql_db')], [['c', 'db']]), { seconds: 1 }).global.stalePct).toBe(0)
  })

  it('per-partition billing counts partitions, not replicas', () => {
    registry.test_shards = { ...registry.stream, type: 'test_shards', cost: 0.01, costPer: 'partition' }
    const s = run(design([node('t', 'test_shards', { partitions: 8 })], []), { seconds: 0.1 })
    expect(s.global.costHr).toBeCloseTo(0.08)
  })

  it('partitioned store throttles the hot key above the per-partition limit', () => {
    registry.test_dynamo = { ...registry.kv, type: 'test_dynamo', simBehavior: 'partitioned',
      params: [...registry.kv.params, { key: 'partition_read_rps', label: 'r', default: 3000 }, { key: 'partition_write_rps', label: 'w', default: 1000 }] }
    const d = design([node('c', 'client', { retries: 0 }), node('t', 'test_dynamo', { replicas: 10 })], [['c', 't']])
    const spread = run(d, { rps: 10_000, readRatio: 0.9 })
    const hot = run(d, { rps: 10_000, readRatio: 0.9, hotKey: 0.5 })
    expect(spread.global.errorPct).toBeCloseTo(0)
    // hot reads 4500 > 3000 and hot writes 500 < 1000: 1500 of 10k throttled
    expect(hot.metrics.t.dropped).toBeCloseTo(1500)
    expect(hot.global.errorPct).toBeCloseTo(15)
  })

  it('consensus store: writes cost replication_factor × work and add a quorum round trip', () => {
    registry.test_crdb = { ...registry.sql_db, type: 'test_crdb', simBehavior: 'consensus',
      params: [...registry.kv.params, { key: 'replication_factor', label: 'rf', default: 3 }, { key: 'regions', label: 'regions', default: 1 }] }
    const d = (regions: number) => design([node('c', 'client'), node('t', 'test_crdb', { replicas: 3, capacity_rps: 10_000, regions })], [['c', 't']])
    const one = run(d(1), { rps: 10_000, readRatio: 0.5 })
    // 5k reads + 3 × 5k writes = 20k of 30k capacity
    expect(one.metrics.t.lambda).toBeCloseTo(10_000)
    expect(one.metrics.t.rho).toBeCloseTo(2 / 3)
    const three = run(d(3), { rps: 10_000, readRatio: 0.5 })
    expect(three.metrics.t.latencyMs - one.metrics.t.latencyMs).toBeCloseTo((CROSS_REGION_MS - 1) / 2)
  })
})
