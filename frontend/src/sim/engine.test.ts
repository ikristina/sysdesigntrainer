import { describe, expect, it } from 'vitest'
import { defaultParams } from '../blocks'
import type { Design, SavedNode } from '../design'
import { CROSS_REGION_MS, initialSim, step } from './engine'

const node = (id: string, type: string, params: Record<string, number | string> = {}, parentId?: string): SavedNode =>
  ({ id, type, position: { x: 0, y: 0 }, parentId, params: { ...defaultParams(type), ...params } })
const design = (nodes: SavedNode[], links: [string, string][]): Design =>
  ({ version: 1, nodes, edges: links.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) })
const run = (d: Design, { rps = 1000, readRatio = 0.9, killed = [] as string[], seconds = 5 } = {}) => {
  let s = initialSim()
  for (let i = 0; i < seconds * 10; i++) s = step(d, s, { traffic: { rps, readRatio, multiplier: 1 }, killed })
  return s
}
// client -> one service (2 × 1000 rps, 20 ms) by default
const simple = (svc: Record<string, number> = {}, client: Record<string, number> = {}) =>
  design([node('c', 'client', client), node('s', 'service', svc)], [['c', 's']])

describe('simulator', () => {
  it('under capacity: ρ = λ/μ, no errors, latency near base / (1 - ρ)', () => {
    const s = run(simple(), { rps: 1000 })
    expect(s.metrics.s.rho).toBeCloseTo(0.5)
    expect(s.metrics.s.queue).toBe(0)
    expect(s.global.errorPct).toBeCloseTo(0)
    expect(s.metrics.s.latencyMs).toBeCloseTo(40)
    expect(s.global.p50Ms).toBeGreaterThan(20)
    expect(s.global.p50Ms).toBeLessThan(80)
    expect(s.global.throughput).toBeCloseTo(1000)
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

  it('stream: every consumer group reads every message; partitions cap parallelism', () => {
    const d = design([node('c', 'client'), node('st', 'stream', { partitions: 2 }),
      node('g1', 'worker', { replicas: 4, capacity_rps: 200 }), node('g2', 'worker', { replicas: 1, capacity_rps: 1000 })],
    [['c', 'st'], ['st', 'g1'], ['st', 'g2']])
    const s = run(d, { rps: 600 })
    expect(s.metrics.g1.lambda).toBeCloseTo(400) // only 2 of 4 replicas get a partition
    expect(s.metrics.g2.lambda).toBeCloseTo(600) // keeps up, gets everything
  })

  it('cross-region edges add latency; killing a region kills what is inside', () => {
    const nodes = [node('east', 'region'), node('west', 'region'),
      node('c', 'client', {}, 'east'), node('s', 'service', { replicas: 100 }, 'west')]
    const d = design(nodes, [['c', 's']])
    const s = run(d)
    expect(s.metrics.c.pathMs - s.metrics.s.pathMs).toBeCloseTo(CROSS_REGION_MS)
    expect(run(d, { killed: ['west'] }).metrics.s.dropped).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(run(simple(), { rps: 1900 }).global).toEqual(run(simple(), { rps: 1900 }).global)
  })
})
