// Every lesson and explainer file loads and is consistent, and the simulator agrees with what
// the captions and lesson notes claim (the naive design fails, the intended one passes).
import { describe, expect, it } from 'vitest'
import { registry } from '../blocks'
import { fromDesign, toDesign, type Design, type EdgeRoute, type SavedNode } from '../design'
import { sceneAt } from '../explainers/ops'
import { initialSim, step, type SimState } from '../sim/engine'
import type { Traffic } from '../sim/types'
import { runScenario, summarize, swapped, type Run } from '../compare/run'
import { checks, compareLessons, explainers, graph, lessons, simTraffic, STEP_GUIDE, type CompareLesson, type Variant } from './content'

// Fill in default params, the way the app does when it loads a design.
const withDefaults = (d: Design) => { const f = fromDesign(d); return toDesign(f.nodes, f.edges) }
const run = (d: Design, rps: number, readRatio: number, killed: string[] = [], seconds = 15, from?: SimState, extra: Partial<Traffic> = {}) => {
  let s = from ?? initialSim()
  const full = withDefaults(d)
  for (let i = 0; i < seconds * 10; i++) s = step(full, s, { traffic: { rps, readRatio, multiplier: 1, ...extra }, killed })
  return s
}
const passes = (d: Design, v: Variant) => {
  const s = run(d, v.traffic.rps, v.traffic.read_ratio, [], 15, undefined, simTraffic(v.traffic))
  return checks(s, v.success).every((c) => c.ok)
}
const n = (id: string, type: string, params: Record<string, number | string> = {}): SavedNode =>
  ({ id, type, position: { x: 0, y: 0 }, params })
const graphOf = (nodes: SavedNode[], edges: ([string, string] | [string, string, EdgeRoute])[]): Design =>
  ({ version: 1, nodes, edges: edges.map(([source, target, r]) => ({ id: `${source}-${target}`, source, target, ...r })) })
const chain = (...nodes: SavedNode[]): Design => ({
  version: 1, nodes, edges: nodes.slice(1).map((b, i) => ({ id: `${nodes[i].id}-${b.id}`, source: nodes[i].id, target: b.id })),
})

describe('content files', () => {
  it('found the files', () => {
    expect(lessons.map((l) => l.id)).toEqual([
      'ad-click-aggregation', 'agent-backend', 'bank-aggregator', 'chat', 'consumer-lag', 'doc-pipeline',
      'driver-locations', 'edge-rate-limiter', 'file-sync', 'flash-sale', 'hot-key', 'job-scheduler',
      'kv-store', 'leaderboard', 'ledger', 'llm-cost',
      'llm-gateway', 'metrics-ingest', 'news-feed', 'p99-fix', 'payments', 'rag-search', 'rate-limiter',
      'reddit-place', 'retry-storm', 'typeahead', 'url-shortener', 'video-platform', 'web-crawler',
      'webhooks', 'welcome-emails',
    ])
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

  // client -> lb -> api(replicas), then the store edges
  const front = (replicas: number, ...rest: SavedNode[]) =>
    [n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas }), ...rest]
  const fe: [string, string][] = [['c', 'lb'], ['lb', 'api']]
  const writeFan = graphOf(front(33, n('feeds', 'cache', { replicas: 2 }), n('posts', 'kv')),
    [...fe, ['api', 'feeds', { fanout: 'write' }], ['api', 'posts', { carries: 'write' }]])
  const readFan = (cache: number, kv: number) => graphOf(front(33, n('pc', 'cache', { replicas: cache, hit_ratio: 0.9 }), n('posts', 'kv', { replicas: kv })),
    [...fe, ['api', 'pc', { fanout: 'read' }], ['pc', 'posts']])
  const noFan = graphOf(front(33, n('posts', 'kv')), [...fe, ['api', 'posts']])

  it('news-feed friends: no fan-out fails, fan-out on write passes, fan-out on read melts', () => {
    const v = variant('news-feed', 'friends')
    expect(passes(noFan, v)).toBe(false)
    expect(passes(writeFan, v)).toBe(true)
    expect(passes(readFan(13, 7), v)).toBe(false)
  })

  it('news-feed creators: fan-out on write melts, fan-out on read passes, over-provisioning breaks the budget', () => {
    const v = variant('news-feed', 'creators')
    expect(passes(writeFan, v)).toBe(false)
    expect(passes(readFan(13, 7), v)).toBe(true)
    expect(passes(readFan(20, 10), v)).toBe(false)
  })

  const chatOf = (...stores: SavedNode[]) => graphOf(front(50, ...stores),
    [...fe, ...stores.map((x, i) => [i ? stores[i - 1].id : 'api', x.id] as [string, string])])
  const cached = chatOf(n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'kv', { replicas: 1 }))
  const kv4 = chatOf(n('db', 'kv', { replicas: 4 }))

  it('chat channels: one SQL fails, cache + small KV passes, KV-only breaks the budget', () => {
    const v = variant('chat', 'channels')
    expect(passes(chatOf(n('db', 'sql_db')), v)).toBe(false)
    expect(passes(cached, v)).toBe(true)
    expect(passes(kv4, v)).toBe(false)
  })

  it('chat dms: the cache and read replicas fail on stale reads, KV with 4 replicas passes', () => {
    const v = variant('chat', 'dms')
    expect(passes(cached, v)).toBe(false)
    expect(passes(chatOf(n('db', 'sql_db', { read_replicas: 5 })), v)).toBe(false)
    expect(passes(kv4, v)).toBe(true)
    expect(passes(chatOf(n('db', 'cockroachdb', { replicas: 18 })), v)).toBe(false)
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
    const grown = (r: number) => chain(n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: 19 }),
      n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db', { pool_size: 40, read_replicas: r }))
    expect(passes(grown(0), growth)).toBe(true)
    // Twist: primary down. No replicas: every miss and write fails. One replica: only the 600 writes/s, but $3.08 > $3.
    const primaryGone = (r: number) => {
      let s = initialSim()
      const full = withDefaults(grown(r)), t = simTraffic(growth.traffic)
      for (let i = 0; i < 100; i++) s = step(full, s, { traffic: { ...t, multiplier: 1 }, killed: [], primaryDown: ['db'] })
      return s
    }
    expect(primaryGone(0).metrics.db.dropped / primaryGone(0).metrics.db.lambda).toBeCloseTo(1)
    // Writes (5%) + misses: invalidate-on-write cuts the hit ratio to 0.9 × 0.95, so 14.5% of the 95% reads.
    expect(primaryGone(0).global.errorPct).toBeCloseTo(18.8, 0)
    expect(primaryGone(1).global.errorPct).toBeCloseTo(5, 0) // only the writes
    expect(passes(grown(1), growth)).toBe(false) // over budget
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
    expect(passes(limited(8500), v)).toBe(false) // more than 8 replicas can take
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
    for (const w of [6, 9, 10]) expect(passes(emails(2, null, w), steady)).toBe(false) // the send's 100 ms is on the signup path
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

// Lessons for classic design problems (AI, fintech, infra, quick fixes). Same pattern: the naive design
// fails, the intended one passes, over-provisioning breaks the budget. Numbers are in each file's _notes.
describe('classic-design lessons match the simulator', () => {
  const lesson = (id: string) => lessons.find((l) => l.id === id)!
  const variant = (l: string, v: string) => lesson(l).variants.find((x) => x.id === v)!
  type EdgeSpec = [string, string] | [string, string, EdgeRoute]
  // Run phases of [seconds, traffic multiplier, killed, replicas down] back to back, then score the variant on the last state.
  const after = (d: Design, v: Variant, phases: [number, number, string[], Record<string, number>?][]) => {
    let s = initialSim()
    const full = withDefaults(d), t = simTraffic(v.traffic)
    for (const [sec, multiplier, killed, down] of phases) for (let i = 0; i < sec * 10; i++) s = step(full, s, { traffic: { ...t, multiplier }, killed, down })
    return checks(s, v.success).every((c) => c.ok)
  }
  const long = { timeout_ms: 60000 }
  const clientNode = (p = {}) => n('c', 'client', { ...long, ...p })
  const apiNode = (replicas = 2, p = {}) => n('api', 'service', { replicas, ...long, ...p })
  const llmNode = (replicas: number, id = 'llm', p = {}) => n(id, 'llm', { replicas, ...p })

  it('llm-gateway: default timeouts kill LLM calls; a 0.3 cache trims the pool; easy prompts go to a small model', () => {
    const steady = variant('llm-gateway', 'steady')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), llmNode(12)), steady)).toBe(false) // 1-2 s timeouts
    expect(passes(chain(clientNode(), apiNode(), llmNode(8)), steady)).toBe(false) // rho 1
    expect(passes(chain(clientNode(), apiNode(), llmNode(9)), steady)).toBe(false) // no cache: over budget
    const cached = (k: number) => chain(clientNode(), apiNode(), n('k', 'cache', { hit_ratio: 0.3 }), llmNode(k))
    expect(passes(cached(6), steady)).toBe(false) // rho 0.93
    expect(passes(cached(7), steady)).toBe(true)
    expect(passes(cached(8), steady)).toBe(true)
    expect(passes(cached(9), steady)).toBe(false) // over budget

    const routing = variant('llm-gateway', 'routing')
    const routed = (big: number, small: number) => graphOf([clientNode(), apiNode(), llmNode(big, 'big'), llmNode(small, 'small', { capacity_rps: 40, base_latency_ms: 300 })],
      [['c', 'api'], ['api', 'big', { carries: 'write' }], ['api', 'small', { carries: 'read' }]])
    expect(passes(chain(clientNode(), apiNode(), llmNode(22)), routing)).toBe(false)
    expect(passes(routed(8, 2), routing)).toBe(false)
    expect(passes(routed(9, 2), routing)).toBe(false)
    expect(passes(routed(10, 2), routing)).toBe(true)
    expect(passes(routed(11, 2), routing)).toBe(true)
    expect(passes(routed(11, 3), routing)).toBe(false)
  })

  it('rag-search: the LLM pool decides; trending needs an answer cache in front of the pipeline', () => {
    const rag = (llm: number, emb = 1, hit = 0) => graphOf(
      [clientNode(), apiNode(), ...(hit ? [n('k', 'cache', { hit_ratio: hit })] : []), n('rag', 'service', long), n('emb', 'embedding', { replicas: emb }), n('vdb', 'vector_db'), llmNode(llm)],
      [['c', 'api'], ...(hit ? [['api', 'k'], ['k', 'rag']] as EdgeSpec[] : [['api', 'rag']] as EdgeSpec[]), ['rag', 'emb'], ['rag', 'vdb'], ['rag', 'llm']])
    const tail = variant('rag-search', 'long-tail')
    expect(passes(rag(4), tail)).toBe(false)
    expect(passes(rag(5), tail)).toBe(true)
    expect(passes(rag(6), tail)).toBe(true)
    expect(passes(rag(7), tail)).toBe(false)
    const trending = variant('rag-search', 'trending')
    expect(passes(rag(45, 2), trending)).toBe(false)
    expect(passes(rag(13, 1, 0.7), trending)).toBe(false)
    expect(passes(rag(14, 1, 0.7), trending)).toBe(true)
    expect(passes(rag(15, 1, 0.7), trending)).toBe(true)
    expect(passes(rag(16, 1, 0.7), trending)).toBe(false)
  })

  it('doc-pipeline: sync summaries fail; queue the work; long docs fan out into chunks', () => {
    const docs = (llm: number, queued = true, fan = false) => graphOf(
      [n('c', 'client'), n('api', 'service'), n('blob', 'blob'), ...(queued ? [n('q', 'queue'), n('w', 'worker')] : []), llmNode(llm)],
      [['c', 'api'], ['api', 'blob'], ...(queued ? [['api', 'q'], ['q', 'w'], ['w', 'llm', fan ? { fanout: 'write' } : {}]] as EdgeSpec[] : [['api', 'llm', fan ? { fanout: 'write' } : {}]] as EdgeSpec[])])
    const bulk = variant('doc-pipeline', 'bulk')
    expect(passes(docs(10, false), bulk)).toBe(false)
    expect(after(docs(3), bulk, [[30, 1, []]])).toBe(false) // falls behind
    expect(passes(docs(5), bulk)).toBe(true)
    expect(passes(docs(9), bulk)).toBe(false)

    const longDocs = variant('doc-pipeline', 'long-docs')
    expect(passes(docs(17), longDocs)).toBe(false) // no fan-out edge
    expect(passes(docs(18, false, true), longDocs)).toBe(false)
    expect(after(docs(15, true, true), longDocs, [[30, 1, []]])).toBe(false)
    expect(passes(docs(17, true, true), longDocs)).toBe(true)
    expect(passes(docs(20, true, true), longDocs)).toBe(false)
  })

  it('agent-backend: 6 calls in a row per task; interactive sizes the pool, background queues it', () => {
    const sync = (llm: number) => graphOf([clientNode(), apiNode(), llmNode(llm)], [['c', 'api'], ['api', 'llm', { fanout: 'read', sequential: true }]])
    const bg = (llm: number) => graphOf([n('c', 'client'), n('api', 'service'), n('q', 'queue'), n('w', 'worker', { replicas: 1, timeout_ms: 120000 }), llmNode(llm)],
      [['c', 'api'], ['api', 'q'], ['q', 'w'], ['w', 'llm', { fanout: 'read', sequential: true }]])
    const a = variant('agent-backend', 'assistant')
    expect(passes(chain(clientNode(), apiNode(), llmNode(9)), a)).toBe(false) // no fan-out edge
    expect(passes(sync(7), a)).toBe(false)
    expect(passes(sync(8), a)).toBe(true)
    expect(passes(sync(9), a)).toBe(true)
    expect(passes(sync(10), a)).toBe(false)
    const b = variant('agent-backend', 'background')
    expect(passes(sync(28), b)).toBe(false)
    expect(after(bg(22), b, [[30, 1, []]])).toBe(false) // falls behind
    expect(passes(bg(26), b)).toBe(true)
    expect(passes(bg(29), b)).toBe(true)
    expect(passes(bg(30), b)).toBe(false)
  })

  const card = () => n('card', 'service', { replicas: 1, capacity_rps: 3500, base_latency_ms: 200, timeout_ms: 30000 })
  const lbApi = (api: number, p = {}) => [n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: api, ...p })]
  const fe: EdgeSpec[] = [['c', 'lb'], ['lb', 'api']]

  it('payments: checkout waits on the card; the big sale returns 202 and authorizes from a queue', () => {
    const sync = (api: number, edges: EdgeSpec[] = [['api', 'db'], ['api', 'card', { carries: 'write' }]], mid: SavedNode[] = []) =>
      graphOf([...lbApi(api, { timeout_ms: 5000 }), ...mid, n('db', 'sql_db'), card()], [...fe, ...edges])
    const queued = (api: number, w: number) => graphOf([...lbApi(api), n('db', 'sql_db'), n('q', 'queue'), n('w', 'worker', { replicas: w }), card()],
      [...fe, ['api', 'db'], ['api', 'q', { carries: 'write' }], ['q', 'w'], ['w', 'card']])
    const checkout = variant('payments', 'checkout')
    expect(passes(sync(5), checkout)).toBe(true)
    expect(passes(sync(6, [['api', 'db'], ['api', 'card']]), checkout)).toBe(false) // reads hit the card too
    expect(passes(sync(5, [['api', 'k'], ['k', 'db'], ['api', 'card', { carries: 'write' }]], [n('k', 'cache')]), checkout)).toBe(false) // stale
    expect(passes(queued(6, 11), checkout)).toBe(false) // over budget
    const sale = variant('payments', 'big-sale')
    expect(passes(sync(8), sale)).toBe(false) // waits on the card's 200 ms
    expect(passes(queued(6, 15), sale)).toBe(true)
    expect(passes(queued(6, 25), sale)).toBe(false)
  })

  it('webhooks: deliver from a queue; Black Friday needs a partitioned log, not SQS pricing', () => {
    const m = () => n('m', 'service', { replicas: 1, capacity_rps: 100000, base_latency_ms: 400, timeout_ms: 30000 })
    const q = (mid: SavedNode, w: number, api = 3) => graphOf([n('c', 'client'), n('api', 'service', { replicas: api }), mid, n('w', 'worker', { replicas: w }), m()],
      [['c', 'api'], ['api', mid.id], [mid.id, 'w'], ['w', 'm']])
    const steady = variant('webhooks', 'steady')
    expect(passes(graphOf([n('c', 'client'), n('api', 'service', { replicas: 3 }), m()], [['c', 'api'], ['api', 'm']]), steady)).toBe(false)
    expect(passes(q(n('q', 'queue'), 9), steady)).toBe(false)
    expect(passes(q(n('q', 'queue'), 11), steady)).toBe(true)
    expect(passes(q(n('q', 'queue'), 20), steady)).toBe(false)
    const bf = variant('webhooks', 'black-friday')
    expect(passes(q(n('q', 'queue'), 65, 15), bf)).toBe(false)
    expect(passes(q(n('q', 'sqs'), 65, 15), bf)).toBe(false) // request pricing
    expect(passes(q(n('q', 'kafka', { partitions: 12 }), 65, 15), bf)).toBe(false) // 12 readers
    expect(passes(q(n('q', 'kafka', { partitions: 66 }), 66, 15), bf)).toBe(true)
    expect(passes(q(n('q', 'kafka', { partitions: 100 }), 100, 15), bf)).toBe(false) // over budget
  })

  it('ledger: one primary until it runs out of writes, then shards or CockroachDB', () => {
    const one = (api: number, ...store: SavedNode[]) => graphOf([...lbApi(api), ...store],
      [...fe, ...store.map((x, i) => [i ? store[i - 1].id : 'api', x.id] as EdgeSpec)])
    const startup = variant('ledger', 'startup')
    expect(passes(one(4, n('db', 'sql_db')), startup)).toBe(true)
    expect(passes(one(4, n('k', 'cache'), n('db', 'sql_db')), startup)).toBe(false)
    expect(passes(one(4, n('db', 'sql_db', { read_replicas: 1 })), startup)).toBe(false)
    expect(passes(one(4, n('db', 'dynamodb')), startup)).toBe(false) // request pricing
    const scale = variant('ledger', 'scale')
    const shards = (k: number) => graphOf([...lbApi(20), n('router', 'load_balancer'), ...Array.from({ length: k }, (_, i) => n(`s${i}`, 'sql_db'))],
      [...fe, ['api', 'router'], ...Array.from({ length: k }, (_, i) => ['router', `s${i}`] as EdgeSpec)])
    expect(passes(one(20, n('db', 'sql_db')), scale)).toBe(false)
    expect(passes(shards(3), scale)).toBe(false) // 16k / 3 is over 5k each
    expect(passes(shards(4), scale)).toBe(true)
    expect(passes(one(20, n('db', 'cockroachdb', { replicas: 14 })), scale)).toBe(true)
    expect(passes(one(20, n('db', 'cockroachdb', { replicas: 18 })), scale)).toBe(false)
  })

  it('bank-aggregator: banks stay off the read path; fresh reads need a store that serves them from the primary', () => {
    const banks = () => n('banks', 'service', { replicas: 1, capacity_rps: 500, base_latency_ms: 800, timeout_ms: 30000 })
    const refresh = (store: SavedNode[], readEdges: EdgeSpec[]) => graphOf([...lbApi(25), ...store, n('q', 'queue'), n('w', 'worker', { replicas: 3 }), banks()],
      [...fe, ...readEdges, ['api', 'q', { carries: 'write' }], ['q', 'w'], ['w', 'banks'], ['w', store[store.length - 1].id]])
    const cached = refresh([n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')], [['api', 'k', { carries: 'read' }], ['k', 'db']])
    const kv = refresh([n('db', 'kv')], [['api', 'db', { carries: 'read' }]])
    const a = variant('bank-aggregator', 'budgeting-apps')
    expect(passes(graphOf([...lbApi(25), banks()], [...fe, ['api', 'banks']]), a)).toBe(false)
    expect(passes(refresh([n('db', 'sql_db')], [['api', 'db', { carries: 'read' }]]), a)).toBe(false)
    expect(passes(cached, a)).toBe(true)
    expect(passes(kv, a)).toBe(false) // just over budget
    const b = variant('bank-aggregator', 'payments-apps')
    expect(passes(cached, b)).toBe(false) // stale
    expect(passes(kv, b)).toBe(true)
    expect(passes(refresh([n('db', 'kv', { replicas: 8 })], [['api', 'db', { carries: 'read' }]]), b)).toBe(false) // over budget
  })

  it('metrics-ingest: a log keeps intake up when the store dies; rollups (a cache) absorb dashboard fan-out', () => {
    const direct = graphOf([...lbApi(25), n('db', 'wide_column')], [...fe, ['api', 'db']])
    const streamed = (p: number, cache = 0, db = 3, readFan = false) => graphOf(
      [...lbApi(25), n('s', 'kafka', { partitions: p }), n('agg', 'service', { replicas: 24 }), n('db', 'wide_column', { replicas: db }), ...(cache ? [n('k', 'cache', { hit_ratio: cache })] : [])],
      [...fe, ['api', 's', { carries: 'write' }], ['s', 'agg'], ['agg', 'db'],
        ...(cache ? [['api', 'k', { carries: 'read' }], ['k', 'db', { fanout: 'read' }]] as EdgeSpec[] : [['api', 'db', { carries: 'read', ...(readFan ? { fanout: 'read' } : {}) }]] as EdgeSpec[])])
    const ingest = variant('metrics-ingest', 'ingest')
    expect(passes(direct, ingest)).toBe(true) // passes steady...
    expect(after(direct, ingest, [[10, 1, []], [5, 1, ['db']]])).toBe(false) // ...but not the twist
    expect(passes(streamed(4), ingest)).toBe(false) // 4 readers
    expect(passes(streamed(24), ingest)).toBe(true)
    expect(passes(streamed(24, 0, 8), ingest)).toBe(false) // over budget
    // Store down: intake stays green (lag builds and is redelivered), then drains after the restore.
    let s = initialSim()
    const full = withDefaults(streamed(24)), t = simTraffic(ingest.traffic)
    for (const [sec, killed] of [[10, []], [5, ['db']]] as [number, string[]][]) for (let i = 0; i < sec * 10; i++) s = step(full, s, { traffic: { ...t, multiplier: 1 }, killed })
    expect(s.global.errorPct).toBeCloseTo(2, 1) // only the dashboard reads (2%): every write goes into the log
    expect(s.metrics.s.queue).toBeGreaterThan(20000)
    expect(after(streamed(24), ingest, [[10, 1, []], [5, 1, ['db']], [40, 1, []]])).toBe(true)
    const incident = variant('metrics-ingest', 'incident')
    expect(passes(streamed(24, 0, 14, true), incident)).toBe(false)
    expect(passes(streamed(24, 0, 16, true), incident)).toBe(false) // over budget
    expect(passes(streamed(24, 0.9), incident)).toBe(true)
  })

  it('job-scheduler: queue the work; at 8k jobs/s a queue and one SQL primary both run out', () => {
    const q = (api: number, mid: SavedNode, w: number, store: SavedNode) => graphOf([...lbApi(api), store, mid, n('w', 'worker', { replicas: w })],
      [...fe, ['api', store.id], ['api', mid.id, { carries: 'write' }], [mid.id, 'w'], ['w', store.id]])
    const steady = variant('job-scheduler', 'steady')
    expect(passes(graphOf([...lbApi(3), n('db', 'sql_db'), n('w', 'worker', { replicas: 6 })], [...fe, ['api', 'db'], ['api', 'w', { carries: 'write' }]]), steady)).toBe(false)
    expect(passes(q(3, n('q', 'queue'), 6, n('db', 'sql_db')), steady)).toBe(true)
    expect(passes(q(3, n('q', 'queue'), 12, n('db', 'sql_db')), steady)).toBe(false)
    const platform = variant('job-scheduler', 'platform')
    expect(passes(q(22, n('q', 'queue'), 45, n('db', 'sql_db')), platform)).toBe(false)
    expect(passes(q(22, n('q', 'kafka', { partitions: 45 }), 45, n('db', 'sql_db')), platform)).toBe(false)
    expect(passes(q(22, n('q', 'sqs'), 45, n('db', 'kv')), platform)).toBe(false) // request pricing
    expect(passes(q(22, n('q', 'kafka', { partitions: 45 }), 45, n('db', 'kv')), platform)).toBe(true)
    expect(passes(q(22, n('q', 'kafka', { partitions: 45 }), 45, n('db', 'kv', { replicas: 2 })), platform)).toBe(false)
    // Twist: one of 6 workers down 10 s. The 5 left run at ρ 1.0: the backlog holds, no spare.
    expect(after(q(3, n('q', 'queue'), 6, n('db', 'sql_db')), steady, [[10, 1, []], [10, 1, [], { w: 1 }], [60, 1, []]])).toBe(true)
  })

  it('edge-rate-limiter: exact forces one central counter, fast forces one per region', () => {
    const regions = ['us', 'eu', 'ap']
    const limiter = (local: boolean, edge: number) => {
      const nodes: SavedNode[] = regions.map((r) => n(r, 'region', { name: r }))
      const edges: EdgeSpec[] = []
      const inR = (x: SavedNode, r: string) => ({ ...x, parentId: r })
      for (const r of regions) {
        nodes.push(inR(n(`c_${r}`, 'client'), r), inR(n(`edge_${r}`, 'service', { replicas: edge }), r))
        edges.push([`c_${r}`, `edge_${r}`], [`edge_${r}`, local ? `cnt_${r}` : 'cnt'])
        if (local) nodes.push(inR(n(`cnt_${r}`, 'cache'), r))
      }
      if (!local) nodes.push(inR(n('cnt', 'cache'), 'us'))
      return graphOf(nodes, edges)
    }
    const exact = variant('edge-rate-limiter', 'exact')
    expect(passes(limiter(false, 3), exact)).toBe(true)
    expect(passes(limiter(false, 10), exact)).toBe(false) // over budget
    expect(passes(limiter(true, 3), exact)).toBe(false) // a counter per region costs more
    const fast = variant('edge-rate-limiter', 'fast')
    expect(passes(limiter(false, 3), fast)).toBe(false) // 70 ms away
    expect(passes(limiter(false, 8), fast)).toBe(false)
    expect(passes(limiter(true, 3), fast)).toBe(true)
  })

  it('flash-sale: CDN + cache absorb the onsale reads; the drop needs a gate in front of the database', () => {
    const site = (front: SavedNode[], api: number, back: SavedNode[]) => chain(n('c', 'client'), ...front, n('lb', 'load_balancer'), n('api', 'service', { replicas: api }), ...back)
    const onsale = variant('flash-sale', 'onsale')
    expect(passes(site([], 60, [n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')]), onsale)).toBe(false)
    expect(passes(site([n('cdn', 'cdn')], 10, [n('db', 'sql_db')]), onsale)).toBe(false)
    expect(passes(site([n('cdn', 'cdn')], 10, [n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')]), onsale)).toBe(true)
    expect(passes(site([n('cdn', 'cdn')], 10, [n('db', 'sql_db', { read_replicas: 2 })]), onsale)).toBe(false) // over budget
    const drop = variant('flash-sale', 'drop')
    const gated = (limit: number) => site([n('cdn', 'cdn'), n('gw', 'api_gateway', { rate_limit_rps: limit })], 6, [n('db', 'sql_db')])
    expect(passes(site([n('cdn', 'cdn')], 20, [n('db', 'sql_db')]), drop)).toBe(false)
    expect(passes(gated(4000), drop)).toBe(true)
    expect(passes(gated(6000), drop)).toBe(false)
    expect(passes(site([n('cdn', 'cdn')], 20, [n('db', 'cockroachdb', { replicas: 18 })]), drop)).toBe(false) // over budget
  })

  it('leaderboard: a CDN + cache absorb spectator reads; tournament score updates need an in-memory sorted store', () => {
    const site = (front: SavedNode[], api: number, back: SavedNode[]) => chain(n('c', 'client'), ...front, n('lb', 'load_balancer'), n('api', 'service', { replicas: api }), ...back)
    const naive = chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db'))
    const watch = variant('leaderboard', 'spectators')
    expect(passes(naive, watch)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('lb', 'load_balancer', { replicas: 3 }), n('api', 'service', { replicas: 110 }), n('db', 'redis')), watch)).toBe(false) // over budget
    expect(passes(site([n('cdn', 'cdn')], 12, [n('db', 'sql_db')]), watch)).toBe(false)
    for (const api of [12, 13]) expect(passes(site([n('cdn', 'cdn')], api, [n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')]), watch)).toBe(true)
    expect(passes(site([n('cdn', 'cdn')], 12, [n('db', 'redis')]), watch)).toBe(true)
    expect(passes(site([n('cdn', 'cdn')], 12, [n('db', 'sql_db', { read_replicas: 2 })]), watch)).toBe(false) // over budget
    const live = variant('leaderboard', 'tournament')
    expect(passes(naive, live)).toBe(false)
    expect(passes(site([], 35, [n('db', 'sql_db')]), live)).toBe(false)
    expect(passes(site([n('cdn', 'cdn')], 26, [n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')]), live)).toBe(false) // writes pass through
    for (const api of [33, 34]) expect(passes(site([], api, [n('db', 'redis')]), live)).toBe(true)
    for (const store of ['cache', 'valkey']) expect(passes(site([], 34, [n('db', store)]), live)).toBe(true)
    const shards = graphOf([...lbApi(34), n('router', 'load_balancer'), ...Array.from({ length: 7 }, (_, i) => n(`s${i}`, 'sql_db'))],
      [...fe, ['api', 'router'], ...Array.from({ length: 7 }, (_, i) => ['router', `s${i}`] as EdgeSpec)])
    expect(passes(shards, live)).toBe(false) // over budget
    expect(passes(site([], 34, [n('db', 'redis', { replicas: 4 })]), live)).toBe(false) // over budget
    expect(passes(site([], 34, [n('db', 'kv')]), live)).toBe(false)
    expect(passes(site([n('cdn', 'cdn')], 26, [n('db', 'kv')]), live)).toBe(true) // the sim can't tell a hash from a sorted set
  })

  it('typeahead: per-keystroke search is too dear; global suggestions cache at the edge, personal ones need a bigger in-memory tier', () => {
    const naive = chain(n('c', 'client'), n('api', 'service', { replicas: 66 }), n('ix', 'search', { replicas: 36 }))
    const suggest = (edge: SavedNode[], api: number, table = 1) => chain(n('c', 'client'), ...edge, n('api', 'service', { replicas: api }),
      n('k', 'cache', { hit_ratio: 0.95, replicas: table }), n('ix', 'search'))
    const cdn = n('cdn', 'cdn', { hit_ratio: 0.9 })
    const global = variant('typeahead', 'global')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('ix', 'search')), global)).toBe(false) // collapses
    expect(passes(naive, global)).toBe(false) // sized for 60k: over budget
    expect(passes(chain(n('c', 'client'), cdn, n('api', 'service', { replicas: 7 }), n('ix', 'search', { replicas: 4 })), global)).toBe(false) // no prefix table
    expect(passes(suggest([], 64, 2), global)).toBe(false) // no CDN: over budget
    expect(passes(suggest([cdn], 6), global)).toBe(false) // services at rho 1
    expect(passes(suggest([cdn], 7), global)).toBe(true)
    expect(passes(suggest([cdn], 8), global)).toBe(true)
    expect(passes(suggest([cdn], 9), global)).toBe(true)
    expect(passes(suggest([cdn], 10), global)).toBe(false) // over budget
    const personal = variant('typeahead', 'personal')
    expect(passes(naive, personal)).toBe(false)
    expect(passes(suggest([n('cdn', 'cdn', { hit_ratio: 0 })], 7), personal)).toBe(false) // the global design: CDN can't hit
    expect(passes(suggest([], 66), personal)).toBe(false) // one cache node: 60k/s on 50k capacity
    expect(passes(suggest([], 63, 2), personal)).toBe(false) // rho 0.95: p99 just over
    expect(passes(suggest([], 64, 2), personal)).toBe(true)
    expect(passes(suggest([], 65, 2), personal)).toBe(true)
    expect(passes(suggest([], 69, 2), personal)).toBe(true)
    expect(passes(suggest([], 70, 2), personal)).toBe(false) // over budget
  })

  const withParams = (d: Design, extra: Record<string, Record<string, number | string>>) => ({
    ...d, nodes: d.nodes.map((x) => ({ ...x, params: { ...x.params, ...extra[x.id] } })),
  })
  const insert = (d: Design, mid: SavedNode, before: string) => {
    const e = d.edges.find((x) => x.target === before)!
    return { ...d, nodes: [...d.nodes, mid], edges: [...d.edges.filter((x) => x !== e),
      { id: `${e.source}-${mid.id}`, source: e.source, target: mid.id }, { id: `${mid.id}-${before}`, source: mid.id, target: before }] }
  }

  it('hot-key: a cache fixes hot reads; a hot counter needs Redis, not a cache in front', () => {
    const start = graph(lesson('hot-key').starter_graph!)
    const celeb = variant('hot-key', 'celebrity')
    expect(passes(start, celeb)).toBe(false)
    expect(passes(insert(start, n('k', 'cache', { hit_ratio: 0.8 }), 'db'), celeb)).toBe(true)
    expect(passes(withParams(insert(start, n('k', 'cache', { hit_ratio: 0.8 }), 'db'), { api: { replicas: 120 } }), celeb)).toBe(false) // over budget
    const likes = variant('hot-key', 'likes-counter')
    expect(passes(start, likes)).toBe(false)
    expect(passes(insert(start, n('k', 'cache', { hit_ratio: 0.9 }), 'db'), likes)).toBe(false) // writes pass through
    const redis = { ...start, nodes: start.nodes.map((x) => (x.id === 'db' ? { ...x, type: 'redis' } : x)) }
    expect(passes(redis, likes)).toBe(true)
    expect(passes(withParams(redis, { api: { replicas: 120 } }), likes)).toBe(false) // over budget
  })

  it('retry-storm: a 5 s spike sticks with retries; a retry budget or a gateway recovers, backoff alone does not', () => {
    const start = graph(lesson('retry-storm').starter_graph!)
    const spikeThenNormal: [number, number, string[]][] = [[5, 1, []], [5, 2, []], [30, 1, []]]
    const a = variant('retry-storm', 'new-app')
    expect(passes(start, a)).toBe(true) // fine until the spike
    expect(after(start, a, spikeThenNormal)).toBe(false)
    expect(after(withParams(start, { client: { backoff: 'exponential' } }), a, spikeThenNormal)).toBe(false)
    expect(after(withParams(start, { client: { retry_budget: '20%' } }), a, spikeThenNormal)).toBe(false)
    expect(after(withParams(start, { client: { retry_budget: '10%' } }), a, spikeThenNormal)).toBe(true)
    expect(after(withParams(start, { client: { retry_budget: '10%', backoff: 'exponential' } }), a, spikeThenNormal)).toBe(true)
    expect(after(withParams(start, { api: { replicas: 6 } }), a, spikeThenNormal)).toBe(false) // recovers, over budget
    const b = variant('retry-storm', 'old-clients')
    const gated = insert(start, n('gw', 'api_gateway', { rate_limit_rps: 4500 }), 'lb')
    expect(after(start, b, spikeThenNormal)).toBe(false)
    expect(after(gated, b, spikeThenNormal)).toBe(true)
    expect(after(withParams(start, { api: { replicas: 6 } }), b, spikeThenNormal)).toBe(false) // recovers, over budget
  })

  it('reddit-place: 33M pushes/s size the connection tier; the big board needs a CDN in front of board loads', () => {
    const naive = chain(n('c', 'client'), n('api', 'service', { replicas: 14 }), n('db', 'sql_db'))
    const cache = (replicas: number) => n('k', 'cache', { replicas })
    // client [-> CDN] -> LB -> api -> board store (fan-out read = 5 KB chunks) + api -> connection servers (fan-out write)
    const place = (api: number, gw: number, store: SavedNode, cdn?: string, chunks = false) => graphOf(
      [n('c', 'client'), ...(cdn ? [n('cdn', cdn)] : []), n('lb', 'load_balancer'), n('api', 'service', { replicas: api }), store,
        n('gw', 'service', { replicas: gw, capacity_rps: 1000000 })],
      [...(cdn ? [['c', 'cdn'], ['cdn', 'lb']] as EdgeSpec[] : [['c', 'lb']] as EdgeSpec[]), ['lb', 'api'],
        ['api', store.id, chunks ? { fanout: 'read' } : {}], ['api', 'gw', { carries: 'write', fanout: 'write' }]])
    const small = variant('reddit-place', 'small')
    expect(passes(naive, small)).toBe(false)
    expect(passes(place(14, 40, n('db', 'sql_db')), small)).toBe(false)
    expect(passes(place(13, 40, cache(1)), small)).toBe(true)
    expect(passes(place(14, 40, cache(1)), small)).toBe(true)
    expect(passes(place(14, 60, cache(1)), small)).toBe(false) // over budget
    const big = variant('reddit-place', 'big')
    expect(passes(naive, big)).toBe(false)
    expect(passes(place(14, 40, cache(1), undefined, true), big)).toBe(false) // chunk reads melt the store
    expect(passes(place(14, 40, cache(22), undefined, true), big)).toBe(false) // over budget
    expect(passes(place(3, 40, cache(3), 'cdn', true), big)).toBe(true)
    expect(passes(place(3, 40, cache(4), 'cdn', true), big)).toBe(true)
    expect(passes(place(3, 60, cache(3), 'cdn', true), big)).toBe(false) // over budget
    expect(passes(place(3, 40, cache(3), 'cloudfront', true), big)).toBe(false) // billed per GB
  })

  it('consumer-lag: consumers past the partition count sit idle; more partitions (and batching) fix it', () => {
    const start = graph(lesson('consumer-lag').starter_graph!)
    const steady = variant('consumer-lag', 'steady')
    expect(passes(start, steady)).toBe(false)
    expect(passes(withParams(start, { consumers: { replicas: 24 } }), steady)).toBe(false)
    expect(passes(withParams(start, { orders: { partitions: 12 } }), steady)).toBe(true)
    expect(passes(withParams(start, { orders: { partitions: 30 }, consumers: { replicas: 30 } }), steady)).toBe(false) // over budget
    const growth = variant('consumer-lag', 'growth')
    expect(passes(withParams(start, { orders: { partitions: 12 } }), growth)).toBe(false)
    expect(passes(withParams(start, { orders: { partitions: 30 }, consumers: { replicas: 30 } }), growth)).toBe(false) // over budget
    expect(passes(withParams(start, { orders: { partitions: 14 }, consumers: { replicas: 14, capacity_rps: 500 } }), growth)).toBe(true)
  })

  it('llm-cost: the starter is over budget; right-sizing is not enough; a cache or batching from a queue is', () => {
    const start = graph(lesson('llm-cost').starter_graph!)
    const repeats = variant('llm-cost', 'repeats')
    expect(passes(start, repeats)).toBe(false)
    expect(passes(withParams(start, { llm: { replicas: 9 } }), repeats)).toBe(false) // right-sized, still over
    const cached = (r: number) => withParams(insert(start, n('k', 'cache', { hit_ratio: 0.7 }), 'llm'), { llm: { replicas: r } })
    expect(passes(cached(2), repeats)).toBe(false)
    expect(passes(cached(3), repeats)).toBe(true)
    expect(passes(cached(4), repeats)).toBe(true)
    expect(passes(cached(5), repeats)).toBe(false) // over budget
    const batch = variant('llm-cost', 'batch-ok')
    const batched = { capacity_rps: 10, base_latency_ms: 4000 }
    const queued = (r: number) => withParams(insert(insert(start, n('q', 'queue'), 'llm'), n('w', 'worker', { replicas: 1 }), 'llm'), { llm: { replicas: r, ...batched }, api: { timeout_ms: 1000 } })
    expect(passes(start, batch)).toBe(false)
    expect(passes(withParams(start, { llm: { replicas: 5, ...batched } }), batch)).toBe(false) // batched but users wait
    expect(after(queued(3), batch, [[30, 1, []]])).toBe(false) // falls behind
    expect(passes(queued(5), batch)).toBe(true)
    expect(passes(queued(6), batch)).toBe(true)
    expect(passes(queued(7), batch)).toBe(false) // over budget
  })

  it('video-platform: transcode from a queue, not inline; a CDN takes the segment fetches off the origin', () => {
    const tx = (r: number) => n('w', 'worker', { replicas: r, capacity_rps: 2, base_latency_ms: 20000 })
    const creators = variant('video-platform', 'creators')
    const queued = (r: number) => graphOf([n('c', 'client'), n('api', 'service'), n('blob', 'blob'), n('q', 'queue'), tx(r)],
      [['c', 'api'], ['api', 'blob'], ['api', 'q'], ['q', 'w'], ['w', 'blob']])
    expect(passes(chain(n('c', 'client'), n('api', 'service'), tx(13), n('blob', 'blob')), creators)).toBe(false) // inline
    expect(passes(chain(clientNode(), apiNode(), tx(13), n('blob', 'blob')), creators)).toBe(false) // inline, long timeouts
    expect(after(queued(12), creators, [[120, 1, []]])).toBe(false) // falls behind
    expect(passes(queued(13), creators)).toBe(true)
    expect(passes(queued(14), creators)).toBe(true)
    expect(passes(queued(15), creators)).toBe(false) // over budget

    const viewers = variant('video-platform', 'viewers')
    const origin = (api: number, front: SavedNode[] = []) => chain(n('c', 'client'), ...front, n('lb', 'load_balancer'), n('api', 'service', { replicas: api }), n('blob', 'blob'))
    const blobs = Array.from({ length: 5 }, (_, i) => n(`b${i}`, 'blob'))
    const sharded = graphOf([n('c', 'client'), n('lb', 'load_balancer'), n('api', 'service', { replicas: 55 }), n('lb2', 'load_balancer'), ...blobs],
      [['c', 'lb'], ['lb', 'api'], ['api', 'lb2'], ...blobs.map((b): EdgeSpec => ['lb2', b.id])])
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('blob', 'blob')), viewers)).toBe(false)
    expect(passes(origin(50), viewers)).toBe(false) // one blob store melts
    expect(passes(sharded, viewers)).toBe(false) // over budget
    expect(passes(origin(4, [n('cdn', 'cdn')]), viewers)).toBe(false)
    expect(passes(origin(5, [n('cdn', 'cdn')]), viewers)).toBe(false) // rho 1, misses p99
    expect(passes(origin(6, [n('cdn', 'cdn')]), viewers)).toBe(true)
    expect(passes(origin(7, [n('cdn', 'cdn')]), viewers)).toBe(true)
    expect(passes(origin(8, [n('cdn', 'cdn')]), viewers)).toBe(true)
    expect(passes(origin(9, [n('cdn', 'cdn')]), viewers)).toBe(false) // over budget
    expect(passes(chain(n('c', 'client'), n('cdn', 'cdn'), n('blob', 'blob')), viewers)).toBe(true) // bucket as origin
    expect(run(origin(6, [n('cdn', 'cloudfront')]), 50000, 1, [], 15, undefined, simTraffic(viewers.traffic)).global.costHr).toBeCloseTo(15480.68, 1)
  })

  it('driver-locations: latest positions live in memory, not a SQL row each; the global map is split by region', () => {
    const site = (api: number, ...back: SavedNode[]) => chain(...lbApi(api), ...back)
    const shards = (k: number) => graphOf([...lbApi(25), n('router', 'load_balancer'), ...Array.from({ length: k }, (_, i) => n(`s${i}`, 'sql_db'))],
      [...fe, ['api', 'router'], ...Array.from({ length: k }, (_, i) => ['router', `s${i}`] as EdgeSpec)])
    const city = variant('driver-locations', 'one-city')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db')), city)).toBe(false)
    expect(passes(site(25, n('k', 'cache', { hit_ratio: 0.9 }), n('db', 'sql_db')), city)).toBe(false) // writes pass through
    expect(passes(shards(4), city)).toBe(false) // rho 1
    expect(passes(shards(5), city)).toBe(false) // over budget
    expect(passes(site(22, n('k', 'kv', { replicas: 2 })), city)).toBe(false) // rho 1
    expect(passes(site(23, n('k', 'kv', { replicas: 3 })), city)).toBe(false) // over budget
    expect(passes(site(22, n('k', 'cache')), city)).toBe(false) // services near rho 1
    expect(passes(site(23, n('k', 'cache')), city)).toBe(true)
    expect(passes(site(25, n('k', 'cache')), city)).toBe(true)
    expect(passes(site(30, n('k', 'cache')), city)).toBe(false) // over budget

    // One region each for us, eu, ap: client -> lb -> api, then a store per region or one in us.
    const world = (local: boolean, api: number, store: SavedNode) => {
      const regions = ['us', 'eu', 'ap'], inR = (x: SavedNode, r: string) => ({ ...x, parentId: r })
      const nodes: SavedNode[] = regions.map((r) => n(r, 'region', { name: r })), edges: EdgeSpec[] = []
      for (const r of regions) {
        nodes.push(inR(n(`c_${r}`, 'client'), r), inR(n(`lb_${r}`, 'load_balancer'), r), inR(n(`api_${r}`, 'service', { replicas: api }), r))
        edges.push([`c_${r}`, `lb_${r}`], [`lb_${r}`, `api_${r}`], [`api_${r}`, local ? `${store.id}_${r}` : store.id])
        if (local) nodes.push(inR({ ...store, id: `${store.id}_${r}` }, r))
      }
      if (!local) nodes.push(inR(store, 'us'))
      return graphOf(nodes, edges)
    }
    const worldwide = variant('driver-locations', 'global')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db')), worldwide)).toBe(false)
    expect(passes(world(false, 45, n('k', 'cache', { replicas: 4 })), worldwide)).toBe(false) // 70 ms away
    expect(passes(world(true, 45, n('db', 'sql_db')), worldwide)).toBe(false)
    expect(passes(world(true, 45, n('db', 'kv', { replicas: 5 })), worldwide)).toBe(false) // over budget
    expect(passes(world(true, 45, n('k', 'cache')), worldwide)).toBe(true)
    expect(passes(world(true, 46, n('k', 'cache')), worldwide)).toBe(true)
    expect(passes(world(true, 50, n('k', 'cache')), worldwide)).toBe(false) // over budget

  })

  it('file-sync: chunk bytes go straight to blob storage; change checks are answered from memory', () => {
    const naive = chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db'))
    const uploads = variant('file-sync', 'uploads')
    const relay = (api: number) => graphOf([...lbApi(api, { capacity_rps: 50 }), n('db', 'sql_db'), n('blob', 'blob')],
      [...fe, ['api', 'db'], ['api', 'blob']])
    const direct = (api: number, blob = 'blob') => graphOf([...lbApi(api), n('db', 'sql_db'), n('blob', blob)],
      [...fe, ['api', 'db'], ['c', 'blob', { carries: 'write' }]])
    expect(passes(naive, uploads)).toBe(false)
    expect(passes(chain(n('c', 'client'), n('api', 'service', { capacity_rps: 50 }), n('db', 'sql_db')), uploads)).toBe(false)
    expect(passes(relay(66), uploads)).toBe(false) // p99 ~1 s
    expect(passes(relay(100), uploads)).toBe(false) // over budget
    expect(passes(direct(3), uploads)).toBe(false) // rho 1
    for (const api of [4, 5, 6]) expect(passes(direct(api), uploads)).toBe(true)
    expect(passes(direct(7), uploads)).toBe(false) // over budget
    const costAt = (rps: number) => run(direct(4, 's3'), rps, 0, [], 15, undefined, simTraffic({ ...uploads.traffic, rps })).global.costHr
    expect(costAt(3000)).toBeCloseTo(54.93, 1) // twist: S3 bills each PUT
    expect(costAt(1800)).toBeCloseTo(33.33, 1) // twist: 40% dedup

    const sync = variant('file-sync', 'sync')
    const site = (api: number, ...back: SavedNode[]) => chain(...lbApi(api), ...back)
    const cursors = (api: number) => site(api, n('k', 'cache', { hit_ratio: 0.95, write_mode: 'write-through' }), n('db', 'sql_db'))
    expect(passes(naive, sync)).toBe(false)
    expect(passes(site(45, n('db', 'sql_db', { read_replicas: 15 })), sync)).toBe(false) // over budget
    expect(passes(site(42, n('db', 'kv', { replicas: 4 })), sync)).toBe(false) // rho 1
    expect(passes(site(45, n('db', 'kv', { replicas: 5 })), sync)).toBe(false) // over budget
    expect(passes(cursors(41), sync)).toBe(false) // services rho 0.98
    for (const api of [42, 44, 46]) expect(passes(cursors(api), sync)).toBe(true)
    expect(passes(cursors(48), sync)).toBe(false) // over budget
    expect(run(cursors(44), 586000, 0.998).global.errorPct).toBeGreaterThan(90) // twist: poll every 2 s
  })

  it('web-crawler: fetch from a frontier queue, sized by pages in flight; per-link seen checks need an in-memory set', () => {
    const fetcher = (r: number, p = {}) => n('f', 'worker', { replicas: r, capacity_rps: 100, base_latency_ms: 1000, ...p })
    const crawl = (f: SavedNode, store = n('blob', 'blob'), seen?: SavedNode) => graphOf(
      [n('c', 'client'), n('api', 'service'), n('q', 'queue'), f, store, ...(seen ? [seen] : [])],
      [['c', 'api'], ['api', 'q'], ['q', 'f'], ['f', store.id], ...(seen ? [['f', seen.id, { fanout: 'write' }] as EdgeSpec] : [])])
    const sim = (d: Design, v: Variant, seconds = 15) => run(d, v.traffic.rps, v.traffic.read_ratio, [], seconds, undefined, simTraffic(v.traffic))
    const backlog = (s: SimState) => Math.max(0, ...Object.values(s.metrics).map((m) => m.queue))

    const broad = variant('web-crawler', 'broad')
    expect(sim(chain(n('c', 'client'), n('api', 'service'), fetcher(10), n('blob', 'blob')), broad).global.errorPct).toBeGreaterThan(90) // inline
    expect(sim(chain(clientNode(), apiNode(), fetcher(10), n('blob', 'blob')), broad).global.p99Ms).toBeGreaterThan(1000) // inline, long timeouts
    expect(backlog(sim(crawl(fetcher(7)), broad, 120))).toBeCloseTo(8400, -2) // falls behind
    for (const [r, cost] of [[8, 1.1], [9, 1.2], [10, 1.3]]) {
      expect(passes(crawl(fetcher(r)), broad)).toBe(true)
      expect(sim(crawl(fetcher(r)), broad).global.costHr).toBeCloseTo(cost)
    }
    expect(passes(crawl(fetcher(11)), broad)).toBe(false) // over budget
    expect(sim(crawl(fetcher(8), n('db', 'sql_db')), broad).global.costHr).toBeCloseTo(1.55) // pages in SQL: only cost fails
    // Twist: 2 s fetches with the same 100 connections = 50 pages/s per fetcher.
    expect(after(crawl(fetcher(15, { capacity_rps: 50, base_latency_ms: 2000 })), broad, [[120, 1, []]])).toBe(false)
    expect(backlog(sim(crawl(fetcher(16, { capacity_rps: 50, base_latency_ms: 2000 })), broad, 120))).toBe(0)
    expect(sim(crawl(fetcher(16, { capacity_rps: 50, base_latency_ms: 2000 })), broad).global.costHr).toBeCloseTo(1.9)
    expect(passes(crawl(fetcher(8, { base_latency_ms: 2000 })), broad)).toBe(true) // 200 connections each

    const fresh = variant('web-crawler', 'freshness')
    expect(sim(graphOf([n('c', 'client'), n('api', 'service'), n('db', 'sql_db')], [['c', 'api'], ['api', 'db', { fanout: 'write' }]]), fresh).global.errorPct).toBeGreaterThan(90)
    expect(after(crawl(fetcher(3), n('blob', 'blob'), n('s', 'sql_db')), fresh, [[30, 1, []]])).toBe(false)
    expect(after(crawl(fetcher(3), n('blob', 'blob'), n('s', 'kv', { replicas: 3 })), fresh, [[30, 1, []]])).toBe(false)
    const kv4 = sim(crawl(fetcher(3), n('blob', 'blob'), n('s', 'kv', { replicas: 4 })), fresh, 30)
    expect(backlog(kv4)).toBe(0)
    expect(kv4.global.costHr).toBeCloseTo(1.8) // keeps up, over budget
    expect(backlog(sim(crawl(fetcher(2), n('blob', 'blob'), n('s', 'cache')), fresh, 120))).toBeCloseTo(6000, -2) // falls behind
    for (const [r, cost] of [[3, 0.75], [4, 0.85], [5, 0.95]]) {
      expect(passes(crawl(fetcher(r), n('blob', 'blob'), n('s', 'cache')), fresh)).toBe(true)
      expect(sim(crawl(fetcher(r), n('blob', 'blob'), n('s', 'cache')), fresh).global.costHr).toBeCloseTo(cost)
    }
    expect(passes(crawl(fetcher(6), n('blob', 'blob'), n('s', 'cache')), fresh)).toBe(false) // over budget
    expect(sim(crawl(fetcher(3), n('blob', 'blob'), n('s', 'redis')), fresh).global.costHr).toBeCloseTo(0.819, 2)
    expect(passes(crawl(fetcher(3), n('blob', 'blob'), n('s', 'redis')), fresh)).toBe(true)
    expect(passes(graphOf([n('c', 'client'), n('api', 'service'), n('q', 'queue'), fetcher(3), n('blob', 'blob'), n('s', 'cache')],
      [['c', 'api'], ['api', 'q'], ['q', 'f'], ['f', 'blob'], ['f', 's']]), fresh)).toBe(false) // no fan-out edge
  })

  it('ad-click-aggregation: count clicks in memory behind a log; billing adds a raw-click consumer group', () => {
    const agg = (r: number) => n('agg', 'service', { replicas: r, capacity_rps: 5000 })
    const perClick = (store: SavedNode) => graphOf([...lbApi(25), store], [...fe, ['api', store.id]])
    // services -> Kafka (clicks) -> aggregators (no edge out: the flush isn't modeled); services -> SQL (dashboard reads)
    const logged = (p: number, r: number, nodes: SavedNode[] = [], edges: EdgeSpec[] = []) => graphOf(
      [...lbApi(25), n('s', 'kafka', { partitions: p }), agg(r), n('db', 'sql_db'), ...nodes],
      [...fe, ['api', 's', { carries: 'write' }], ['s', 'agg'], ['api', 'db', { carries: 'read' }], ...edges])
    const archived = (p: number, w: number, raw = n('raw', 'wide_column')) =>
      logged(p, 5, [n('arch', 'service', { replicas: w }), raw], [['s', 'arch'], ['arch', 'raw']])
    const at = (d: Design, v: Variant, phases: [number, string[], Record<string, number>?][] = [[15, []]]) => {
      let s = initialSim()
      const full = withDefaults(d), t = simTraffic(v.traffic)
      for (const [sec, killed, down] of phases) for (let i = 0; i < sec * 10; i++) s = step(full, s, { traffic: { ...t, multiplier: 1 }, killed, down })
      return s
    }
    const backlog = (s: SimState) => Math.max(0, ...Object.values(s.metrics).map((m) => m.queue))
    const crash: [number, number, string[]][] = [[10, 1, []], [10, 1, ['agg']], [60, 1, []]]

    const dash = variant('ad-click-aggregation', 'dashboards')
    expect(at(chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db')), dash).global.errorPct).toBeGreaterThan(90) // naive
    expect(at(perClick(n('db', 'sql_db')), dash).global.errorPct).toBeGreaterThan(90) // a row per click
    const ddb = at(perClick(n('db', 'dynamodb')), dash)
    expect(ddb.global.errorPct).toBeLessThan(0.001)
    expect(ddb.global.costHr).toBeCloseTo(46.72, 2) // write request pricing
    expect(backlog(at(logged(3, 3), dash))).toBeCloseTo(69000, -3)
    expect(passes(logged(3, 3), dash)).toBe(false)
    for (const k of [4, 5, 6, 7, 8]) expect(passes(logged(k, k), dash)).toBe(true)
    expect(at(logged(4, 4), dash).metrics.agg.rho).toBeCloseTo(0.98, 2)
    const ok = at(logged(5, 5), dash)
    expect(ok.metrics.api.rho).toBeCloseTo(0.8, 2)
    expect(ok.metrics.db.rho).toBeCloseTo(0.08, 2)
    expect(at(logged(4, 4), dash).global.costHr).toBeCloseTo(4.06, 2)
    expect(at(logged(8, 8), dash).global.costHr).toBeCloseTo(4.46, 2)
    expect(at(logged(9, 9), dash).global.costHr).toBeCloseTo(4.56, 2)
    expect(passes(logged(9, 9), dash)).toBe(false) // over budget
    expect(backlog(at(logged(2, 6), dash))).toBeCloseTo(144000, -3) // 2 readers
    const flushed = logged(6, 6, [], [['agg', 'db']]) // the flush drawn as an edge carries every click
    expect(backlog(at(flushed, dash))).toBeGreaterThan(200000)
    // Twist part 1: one aggregator down 10 s. 5 don't notice; 4 (ρ 0.98) fall 46k behind and drain at 400/s.
    const one: [number, string[], Record<string, number>?][] = [[10, []], [10, [], { agg: 1 }]]
    expect(backlog(at(logged(5, 5), dash, one))).toBe(0)
    expect(backlog(at(logged(4, 4), dash, one))).toBeCloseTo(46000, -3)
    expect(backlog(at(logged(4, 4), dash, [...one, [60, []]]))).toBeCloseTo(22000, -3)
    expect(after(logged(4, 4), dash, [[10, 1, []], [10, 1, [], { agg: 1 }], [60, 1, []]])).toBe(false)
    // Twist part 2: aggregators down 10 s. Intake stays green; 5 drain the lag within 40 s, 4 can't catch up.
    const down = at(logged(5, 5), dash, [[10, []], [10, ['agg']]])
    expect(down.global.errorPct).toBeLessThan(0.001)
    expect(backlog(down)).toBeCloseTo(196000, -3)
    expect(backlog(at(logged(5, 5), dash, [[10, []], [10, ['agg']], [40, []]]))).toBe(0)
    expect(after(logged(5, 5), dash, crash)).toBe(true)
    expect(backlog(at(logged(4, 4), dash, [[10, []], [10, ['agg']], [60, []]]))).toBeCloseTo(172000, -3)
    expect(after(logged(4, 4), dash, crash)).toBe(false)
    const direct = graphOf([...lbApi(25), agg(5), n('db', 'sql_db')], [...fe, ['api', 'agg', { carries: 'write' }], ['api', 'db', { carries: 'read' }]])
    expect(passes(direct, dash)).toBe(true) // no log: passes steady...
    expect(at(direct, dash).global.costHr).toBeCloseTo(3.53, 2)
    expect(at(direct, dash, [[10, []], [10, ['agg']]]).global.errorPct).toBeGreaterThan(97) // ...not the crash
    expect(passes(perClick(n('db', 'wide_column')), dash)).toBe(true) // query-time scans aren't modeled
    expect(at(perClick(n('db', 'wide_column')), dash).global.costHr).toBeCloseTo(3.73, 2)

    const bill = variant('ad-click-aggregation', 'billing')
    expect(passes(chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db')), bill)).toBe(false)
    expect(backlog(at(archived(6, 6), bill))).toBeCloseTo(204000, -3) // dashboards' partition count: 6 archivers read
    expect(backlog(at(archived(18, 18), bill))).toBeCloseTo(24000, -3)
    expect(passes(archived(18, 18), bill)).toBe(false)
    expect(after(archived(19, 19), bill, [[60, 1, []]])).toBe(false) // 600/s short
    for (const k of [20, 21, 22, 23, 24, 25, 26]) expect(passes(archived(k, k), bill)).toBe(true)
    expect(at(archived(20, 20), bill).global.costHr).toBeCloseTo(7.36, 2)
    expect(at(archived(26, 26), bill).global.costHr).toBeCloseTo(7.96, 2)
    expect(at(archived(28, 28), bill).global.costHr).toBeCloseTo(8.16, 2)
    expect(passes(archived(28, 28), bill)).toBe(false) // over budget
    expect(at(archived(26, 26), bill).metrics.raw.rho).toBeCloseTo(0.65, 2)
    expect(backlog(at(archived(26, 26, n('raw', 'sql_db')), bill))).toBeGreaterThan(200000)
    const s3 = graphOf([...lbApi(25), n('db', 's3', { capacity_rps: 30000 })], [...fe, ['api', 'db', { carries: 'write' }]])
    expect(at(s3, bill).global.costHr - 2.53).toBeCloseTo(352.8, 1) // PUT fees for 19.6k clicks/s (LB + 25 services = $2.53); capacity raised as if over more key prefixes, so nothing is retried
    expect(at(archived(26, 26, n('raw', 's3')), bill).global.costHr).toBeGreaterThan(400)
    expect(passes(logged(5, 5), bill)).toBe(true) // the sim can't see the missing archive
    expect(at(logged(5, 5), bill).global.costHr).toBeCloseTo(4.16, 2)
    const dual = logged(5, 5, [n('raw', 'wide_column')], [['api', 'raw', { carries: 'write' }]])
    expect(passes(dual, bill)).toBe(true)
    expect(at(dual, bill).global.costHr).toBeCloseTo(5.36, 2)
  })

  it('kv-store: N = 3 across AZs sized for an AZ loss; quorum reads (R = 2) cost the settings store more nodes', () => {
    // client -> [api] -> [cache] -> router (writes x3) -> one KV block per AZ (reads x R when quorum)
    const store = (k: number, o: { quorum?: boolean; router?: number; api?: number; cache?: boolean } = {}) => {
      const nodes: SavedNode[] = [n('c', 'client'), n('ring', 'load_balancer', { replicas: o.router ?? 2 })], edges: EdgeSpec[] = []
      const front = ['c', ...(o.api ? ['api'] : []), ...(o.cache ? ['k'] : [])]
      if (o.api) nodes.push(n('api', 'service', { replicas: o.api }))
      if (o.cache) nodes.push(n('k', 'cache', { hit_ratio: 0.9 }))
      front.slice(1).forEach((id, i) => edges.push([front[i], id]))
      edges.push([front[front.length - 1], 'ring', { fanout: 'write' }])
      for (const a of ['a', 'b', 'c']) {
        nodes.push(n(`az_${a}`, 'az', { name: `az-${a}` }), { ...n(`kv_${a}`, 'kv', { replicas: k }), parentId: `az_${a}` })
        edges.push(['ring', `kv_${a}`, ...(o.quorum ? [{ fanout: 'read' } as EdgeRoute] : [])] as EdgeSpec)
      }
      return graphOf(nodes, edges)
    }
    const azDown = (d: Design, v: Variant) => after(d, v, [[10, 1, []], [10, 1, ['az_a']]])
    const sim = (d: Design, v: Variant, killed: string[] = []) => run(d, v.traffic.rps, v.traffic.read_ratio, killed, 15, undefined, simTraffic(v.traffic))

    const cart = variant('kv-store', 'shopping-cart')
    const naive = chain(n('c', 'client'), n('api', 'service'), n('db', 'sql_db'))
    expect(sim(naive, cart).global.errorPct).toBeGreaterThan(90)
    const oneBlock = graphOf([n('c', 'client'), n('ring', 'load_balancer', { replicas: 2 }), n('kv', 'kv', { replicas: 12 })], [['c', 'ring', { fanout: 'write' }], ['ring', 'kv']])
    expect(passes(oneBlock, cart)).toBe(true)
    expect(after(oneBlock, cart, [[10, 1, []], [10, 1, ['kv']]])).toBe(false) // one block = every node dies together
    expect(passes(store(4, { router: 1 }), cart)).toBe(false) // router carries 60k
    expect(passes(store(3), cart)).toBe(true)
    expect(azDown(store(3), cart)).toBe(false) // 2 AZs at rho 1
    expect(azDown(store(4), cart)).toBe(true)
    expect(azDown(store(5), cart)).toBe(true)
    expect(passes(store(6), cart)).toBe(false) // over budget
    expect(passes(store(4, { api: 38 }), cart)).toBe(false) // +20 ms and $3.80
    expect(azDown(store(3, { cache: true }), cart)).toBe(true) // stale allowed: ask about the 90% hit ratio
    const four = sim(store(4), cart, ['az_a'])
    expect(four.metrics.kv_b.rho).toBeCloseTo(0.75)
    expect(four.global.p99Ms).toBeLessThan(10)
    expect(sim(store(3), cart, ['az_a']).global.p99Ms).toBeGreaterThan(40)
    const cached = sim(store(3, { cache: true }), cart, ['az_a'])
    expect(cached.global.stalePct).toBeCloseTo(45)
    expect(cached.global.costHr).toBeCloseTo(2.91)
    const apiTier = sim(store(4, { api: 38 }), cart)
    expect(apiTier.global.p99Ms).toBeGreaterThan(30)
    expect(apiTier.global.costHr).toBeCloseTo(7.46)
    for (const [k, cost] of [[4, 3.66], [5, 4.56], [6, 5.46], [7, 6.36]]) expect(sim(store(k), cart).global.costHr).toBeCloseTo(cost)

    const settings = variant('kv-store', 'account-settings')
    expect(sim(naive, settings).global.errorPct).toBeGreaterThan(90)
    expect(azDown(store(4, { quorum: true }), settings)).toBe(false) // 84k on 2 AZs: rho 1.05
    expect(azDown(store(5, { quorum: true }), settings)).toBe(true)
    expect(azDown(store(6, { quorum: true }), settings)).toBe(true)
    expect(passes(store(7, { quorum: true }), settings)).toBe(false) // over budget
    expect(passes(store(4, { quorum: true, cache: true }), settings)).toBe(false) // stale
    expect(sim(store(4, { quorum: true, cache: true }), settings).global.stalePct).toBeCloseTo(81)
    expect(sim(store(4, { quorum: true }), settings).metrics.kv_b.rho).toBeCloseTo(0.7)
    expect(sim(store(5, { quorum: true }), settings, ['az_a']).metrics.kv_b.rho).toBeCloseTo(0.84)
    expect(sim(store(6, { quorum: true }), settings, ['az_a']).metrics.kv_b.rho).toBeCloseTo(0.7)
    // The sim can't see a stale replica: R = 1 passes on fewer nodes. The tutor grades R + W > N.
    expect(azDown(store(3), settings)).toBe(true)
    expect(sim(store(3), settings).global.costHr).toBeCloseTo(2.76)
    // Twist: 60k, 3 router replicas.
    const grown = { ...settings, traffic: { ...settings.traffic, rps: 60000 }, success: { ...settings.success, max_cost_hr: Infinity } }
    expect(azDown(store(6, { quorum: true, router: 3 }), grown)).toBe(false)
    expect(azDown(store(7, { quorum: true, router: 3 }), grown)).toBe(true)
    const big = sim(store(7, { quorum: true, router: 3 }), grown, ['az_a'])
    expect(big.metrics.kv_b.rho).toBeCloseTo(0.9)
    expect(big.global.costHr).toBeCloseTo(6.39)
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
    expect(l.scenarios.every((s) => s.watch)).toBe(true) // every scenario says what to look at
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

  it('Kinesis vs Kafka: Kinesis is cheaper at 5k, rejects the burst, and costs more at 20k', () => {
    expect(winners('kinesis-vs-kafka', 'steady')).toMatchObject({ errors: '-', cost: 'B' })
    expect(winners('kinesis-vs-kafka', 'burst')).toMatchObject({ errors: 'A', 'peak throughput': 'A', 'peak backlog': 'B' })
    expect(winners('kinesis-vs-kafka', 'scale')).toMatchObject({ errors: '-', 'worst p99': '-', cost: 'A' })
    expect(winners('kinesis-vs-kafka', 'scale')).not.toHaveProperty('recovery time') // set_params at 0 s isn't a disruption
  })

  it('Postgres vs CockroachDB: CockroachDB has lower p99 and survives the region, Postgres is cheaper', () => {
    expect(winners('postgres-vs-cockroachdb', 'steady')).toMatchObject({ 'worst p99': 'B', cost: 'A' })
    expect(winners('postgres-vs-cockroachdb', 'region-down')).toMatchObject({ errors: 'B', 'recovery time': 'B', cost: 'A' })
  })
})
