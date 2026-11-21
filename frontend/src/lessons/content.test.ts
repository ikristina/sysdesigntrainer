// Every lesson and explainer file loads and is consistent, and the simulator agrees with what
// the captions and lesson notes claim (the naive design fails, the intended one passes).
import { describe, expect, it } from 'vitest'
import { registry } from '../blocks'
import { fromDesign, toDesign, type Design, type SavedNode } from '../design'
import { sceneAt } from '../explainers/ops'
import { initialSim, step, type SimState } from '../sim/engine'
import { runScenario, summarize, swapped, type Run } from '../compare/run'
import { checks, compareLessons, explainers, graph, lessons, STEP_GUIDE, type CompareLesson, type Variant } from './content'

// Fill in default params, the way the app does when it loads a design.
const withDefaults = (d: Design) => { const f = fromDesign(d); return toDesign(f.nodes, f.edges) }
const run = (d: Design, rps: number, readRatio: number, killed: string[] = [], seconds = 15, from?: SimState) => {
  let s = from ?? initialSim()
  const full = withDefaults(d)
  for (let i = 0; i < seconds * 10; i++) s = step(full, s, { traffic: { rps, readRatio, multiplier: 1 }, killed })
  return s
}
const passes = (d: Design, v: Variant) => {
  const s = run(d, v.traffic.rps, v.traffic.read_ratio)
  return checks(s, v.success).every((c) => c.ok)
}
const n = (id: string, type: string, params: Record<string, number | string> = {}): SavedNode =>
  ({ id, type, position: { x: 0, y: 0 }, params })
const graphOf = (nodes: SavedNode[], edges: [string, string][]): Design =>
  ({ version: 1, nodes, edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) })
const chain = (...nodes: SavedNode[]): Design => ({
  version: 1, nodes, edges: nodes.slice(1).map((b, i) => ({ id: `${nodes[i].id}-${b.id}`, source: nodes[i].id, target: b.id })),
})

describe('content files', () => {
  it('found the files', () => {
    expect(lessons.map((l) => l.id)).toEqual(['p99-fix', 'rate-limiter', 'url-shortener', 'welcome-emails'])
    expect(explainers.map((e) => e.id)).toEqual(['caching-basics', 'load-balancing', 'replication-lag'])
  })

  it.each(lessons)('lesson $id is well-formed', (l) => {
    expect(l.variants.length).toBeGreaterThanOrEqual(2)
    expect(l.hints).toHaveLength(3)
    for (const s of l.steps) expect(STEP_GUIDE[s]).toBeDefined()
    for (const v of l.variants) {
      expect(v.traffic.rps).toBeGreaterThan(0)
      expect(v.success.p99_ms).toBeGreaterThan(0)
    }
    if (l.starter_graph) fromDesign(graph(l.starter_graph)) // throws if invalid
    for (const e of l.explainers ?? []) expect(explainers.map((x) => x.id)).toContain(e)
  })

  it.each(explainers)('explainer $id: every step applies and points at real blocks', (e) => {
    expect(e.steps[0].graph).toBeDefined()
    e.steps.forEach((s, i) => {
      const scene = sceneAt(e, i)
      fromDesign(scene.design)
      const ids = scene.design.nodes.map((x) => x.id)
      for (const id of [...(s.highlight ?? []), ...scene.killed]) expect(ids).toContain(id)
      for (const x of scene.design.nodes) expect(registry[x.type]).toBeDefined()
    })
    for (const l of e.lessons ?? []) expect(lessons.map((x) => x.id)).toContain(l)
  })
})

describe('explainers match the simulator', () => {
  const at = (id: string, i: number) => {
    const scene = sceneAt(explainers.find((e) => e.id === id)!, i)
    return run(scene.design, scene.rps, scene.readRatio, scene.killed)
  }

  it('load balancing', () => {
    expect(at('load-balancing', 0).metrics.api.rho).toBeCloseTo(0.6)
    expect(at('load-balancing', 1).global.errorPct).toBeGreaterThan(1)
    expect(at('load-balancing', 2).metrics.api2.rho).toBeCloseTo(0.5)
    const killed = at('load-balancing', 3)
    expect(killed.metrics.api1.lambda).toBeCloseTo(750)
    expect(killed.global.errorPct).toBeLessThan(0.1)
    expect(at('load-balancing', 4).metrics.api1.rho).toBeGreaterThan(1)
  })

  it('caching', () => {
    expect(at('caching-basics', 0).metrics.db.rho).toBeLessThan(0.3)
    expect(at('caching-basics', 1).metrics.db.rho).toBeGreaterThan(1)
    expect(at('caching-basics', 2).metrics.db.lambda).toBeCloseTo(1900)
    expect(at('caching-basics', 3).metrics.db.rho).toBeGreaterThan(1)
    expect(at('caching-basics', 4).metrics.db.lambda).toBeCloseTo(3800)
    expect(at('caching-basics', 5).metrics.db.rho).toBeGreaterThan(1)
  })

  it('replication lag', () => {
    expect(at('replication-lag', 0).metrics.db.rho).toBeCloseTo(0.6)
    expect(at('replication-lag', 1).metrics.db.rho).toBeGreaterThan(1)
    expect(at('replication-lag', 2).metrics.db.rho).toBeLessThan(0.8)
    expect(at('replication-lag', 3).metrics.db.lagS).toBeGreaterThan(2)
    // Lag recovers once the primary has headroom.
    const e = explainers.find((x) => x.id === 'replication-lag')!
    const lagging = run(sceneAt(e, 3).design, 9000, 0.5)
    const later = run(sceneAt(e, 4).design, 4000, 0.5, [], 5, lagging)
    expect(later.metrics.db.lagS!).toBeLessThan(lagging.metrics.db.lagS!)
  })
})

describe('lessons match the simulator', () => {
  const lesson = (id: string) => lessons.find((l) => l.id === id)!
  const variant = (l: string, v: string) => lesson(l).variants.find((x) => x.id === v)!

  it('url-shortener read-heavy: naive fails, cache passes, over-provisioning breaks the budget', () => {
    const v = variant('url-shortener', 'read-heavy')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db')), v)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('api', 'service', { replicas: 16 }), n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')), v)).toBe(true)
    expect(passes(chain(n('c', 'client'), n('api', 'service', { replicas: 30 }), n('db', 'sql_db', { read_replicas: 5 })), v)).toBe(false)
  })

  it('url-shortener write-heavy: SQL + cache fails, KV passes', () => {
    const v = variant('url-shortener', 'write-heavy')
    expect(passes(chain(n('c', 'client'), n('api', 'service', { replicas: 16 }), n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db', { read_replicas: 2 })), v)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('api', 'service', { replicas: 16 }), n('db', 'kv')), v)).toBe(true)
  })

  it('p99-fix: the starter fails with p99 in seconds; a bigger pool fixes it within budget', () => {
    const start = graph(lesson('p99-fix').starter_graph!)
    const cheap = variant('p99-fix', 'cheap-fix')
    const s = run(start, cheap.traffic.rps, cheap.traffic.read_ratio)
    expect(s.global.p99Ms).toBeGreaterThan(1000)
    const withPool = (d: Design, extra: Partial<Record<string, Record<string, number>>>) => ({
      ...d, nodes: d.nodes.map((x) => ({ ...x, params: { ...x.params, ...extra[x.id] } })),
    })
    expect(passes(withPool(start, { db: { pool_size: 40 } }), cheap)).toBe(true)
    expect(passes(withPool(start, { db: { read_replicas: 1 } }), cheap)).toBe(false) // over budget

    const growth = variant('p99-fix', 'growth')
    expect(passes(withPool(start, { db: { pool_size: 40 } }), growth)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: 19 }),
      n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db', { pool_size: 40 })), growth)).toBe(true)
  })

  it('rate-limiter scraper: the starter collapses; a 5k limit passes; too tight, too loose and scaling fail', () => {
    const v = variant('rate-limiter', 'scraper')
    const start = graph(lesson('rate-limiter').starter_graph!)
    expect(run(start, v.traffic.rps, v.traffic.read_ratio).global.p99Ms).toBeGreaterThan(1000)
    const limited = (limit: number) => graphOf(
      [...start.nodes, n('gw', 'api_gateway', { rate_limit_rps: limit })],
      [['client', 'gw'], ['gw', 'lb'], ['lb', 'api'], ['api', 'store']])
    expect(passes(limited(5000), v)).toBe(true)
    expect(passes(limited(4000), v)).toBe(false) // rejects more than 70%
    expect(passes(limited(6000), v)).toBe(false) // p99 too high
    const scaled = { ...start, nodes: start.nodes.map((x) => (x.id === 'api' ? { ...x, params: { ...x.params, replicas: 25 } } : x)) }
    expect(passes(scaled, v)).toBe(false) // over budget

    const growth = variant('rate-limiter', 'real-growth')
    expect(passes(limited(5000), growth)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: 20 }), n('store', 'kv')), growth)).toBe(true)
    expect(passes(chain(n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: 28 }), n('store', 'kv')), growth)).toBe(false)
  })

  it('welcome-emails: sync fails p99, too few workers fail the backlog, a queue (steady) or wide stream (launch) passes', () => {
    const emails = (api: number, mid: SavedNode | null, workers: number) => graphOf(
      [n('c', 'client'), n('api', 'service', { replicas: api }), n('db', 'sql_db'), ...(mid ? [mid] : []), n('mail', 'worker', { replicas: workers })],
      [['c', 'api'], ['api', 'db'], ...(mid ? [['api', mid.id], [mid.id, 'mail']] as [string, string][] : [['api', 'mail']] as [string, string][])])
    const steady = variant('welcome-emails', 'steady')
    expect(passes(emails(2, null, 10), steady)).toBe(false)
    expect(passes(emails(2, n('q', 'queue'), 2), steady)).toBe(false)
    expect(passes(emails(2, n('q', 'queue'), 6), steady)).toBe(true)
    expect(passes(emails(2, n('q', 'queue'), 30), steady)).toBe(false)

    const launch = variant('welcome-emails', 'launch')
    expect(passes(emails(7, n('q', 'queue'), 22), launch)).toBe(false)
    expect(passes(emails(7, n('q', 'stream', { partitions: 6 }), 22), launch)).toBe(false)
    expect(passes(emails(7, n('q', 'stream', { partitions: 22 }), 22), launch)).toBe(true)
    expect(passes(emails(12, n('q', 'stream', { partitions: 40 }), 40), launch)).toBe(false)
  })
})

describe('compare lessons', () => {
  const sidesOf = (l: CompareLesson) => l.swap.options.map((t, i) =>
    swapped(graph(typeof l.starter_graph === 'string' ? l.starter_graph : l.starter_graph[i]), l.swap.node, t))
  // Winner per row label for one scenario, as 'A' | 'B' | '-'.
  const winners = (id: string, scenario: string) => {
    const l = compareLessons.find((x) => x.id === id)!
    const sc = l.scenarios.find((s) => s.id === scenario)!
    const runs = sidesOf(l).map((d) => runScenario(d, sc, l.swap.node)) as [Run, Run]
    return Object.fromEntries(summarize(runs, sc).map((r) => [r.label, r.winner === null ? '-' : 'AB'[r.winner]]))
  }

  it.each(compareLessons.map((l) => [l.id, l] as const))('%s is consistent', (_, l) => {
    expect(l.swap.options.every((t) => registry[t])).toBe(true)
    for (const d of sidesOf(l)) {
      const ids = new Set(d.nodes.map((x) => x.id))
      expect(ids.has(l.swap.node)).toBe(true)
      for (const e of l.scenarios.flatMap((s) => s.events)) {
        for (const id of [...(e.kill ?? []), ...(e.restore ?? []), ...Object.keys(e.set_params ?? {})]) expect(ids.has(id)).toBe(true)
      }
    }
    expect(l.hints).toHaveLength(3)
    for (const x of l.explainers ?? []) expect(explainers.some((e) => e.id === x)).toBe(true)
  })

  it('Redis vs Memcached: Memcached is cheaper, Redis keeps its keys through node loss and restart', () => {
    expect(winners('redis-vs-memcached', 'steady')).toMatchObject({ 'worst p99': '-', errors: '-', cost: 'B' })
    expect(winners('redis-vs-memcached', 'lose-node')).toMatchObject({ 'worst p99': 'A', 'lowest cache hit': 'A', 'recovery time': 'A', cost: 'B' })
    expect(winners('redis-vs-memcached', 'restart')).toMatchObject({ errors: 'A', 'lowest cache hit': 'A', 'recovery time': 'A' })
  })

  it('Kafka vs SQS: Kafka is cheaper, SQS scales consumers past the partition count', () => {
    expect(winners('kafka-vs-sqs', 'steady')).toMatchObject({ 'worst p99': '-', cost: 'A' })
    expect(winners('kafka-vs-sqs', 'growth')).toMatchObject({ 'backlog at end': 'B', cost: 'A' })
    expect(winners('kafka-vs-sqs', 'outage')).toMatchObject({ 'peak backlog': '-', 'backlog at end': 'B' })
  })

  it('Postgres vs DynamoDB: DynamoDB throttles the hot key, Postgres chokes on writes', () => {
    expect(winners('postgres-vs-dynamodb', 'steady')).toMatchObject({ errors: '-', cost: 'A' })
    expect(winners('postgres-vs-dynamodb', 'hot-key')).toMatchObject({ errors: 'A' })
    expect(winners('postgres-vs-dynamodb', 'more-writes')).toMatchObject({ errors: 'B', 'worst p99': 'B', cost: 'A' })
  })

  it('Redis vs Valkey: the same behavior, Valkey is cheaper', () => {
    for (const sc of ['steady', 'restart']) {
      expect(winners('redis-vs-valkey', sc)).toMatchObject({ 'worst p99': '-', errors: '-', 'lowest cache hit': '-', 'memory cost per GB': 'B', cost: 'B' })
    }
  })

  it('Kinesis vs Kafka: Kinesis is cheaper at 5k, rejects the burst, and costs more at 20k', () => {
    expect(winners('kinesis-vs-kafka', 'steady')).toMatchObject({ errors: '-', cost: 'B' })
    expect(winners('kinesis-vs-kafka', 'burst')).toMatchObject({ errors: 'A', 'peak throughput': 'A', 'peak backlog': 'B' })
    expect(winners('kinesis-vs-kafka', 'scale')).toMatchObject({ errors: '-', 'worst p99': '-', cost: 'A' })
    expect(winners('kinesis-vs-kafka', 'scale')).not.toHaveProperty('recovery time') // set_params at 0 s isn't a disruption
  })

  it('CloudFront vs Cloudflare: same speed, Cloudflare flat price wins on cost everywhere', () => {
    for (const sc of ['steady', 'small', 'video']) expect(winners('cloudfront-vs-cloudflare', sc)).toMatchObject({ 'worst p99': '-', errors: '-', cost: 'B' })
  })

  it('Postgres vs CockroachDB: CockroachDB has lower p99 and survives the region, Postgres is cheaper', () => {
    expect(winners('postgres-vs-cockroachdb', 'steady')).toMatchObject({ 'worst p99': 'B', cost: 'A' })
    expect(winners('postgres-vs-cockroachdb', 'region-down')).toMatchObject({ errors: 'B', 'recovery time': 'B', cost: 'A' })
  })
})
