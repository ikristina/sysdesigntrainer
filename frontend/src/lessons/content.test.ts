// Every lesson and explainer file loads and is consistent, and the simulator agrees with what
// the captions and lesson notes claim (the naive design fails, the intended one passes).
import { describe, expect, it } from 'vitest'
import { registry } from '../blocks'
import { fromDesign, toDesign, type Design, type SavedNode } from '../design'
import { sceneAt } from '../explainers/ops'
import { initialSim, step, type SimState } from '../sim/engine'
import { checks, explainers, graph, lessons, STEP_GUIDE, type Variant } from './content'

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
  return checks(s.global, v.success).every((c) => c.ok)
}
const n = (id: string, type: string, params: Record<string, number | string> = {}): SavedNode =>
  ({ id, type, position: { x: 0, y: 0 }, params })
const chain = (...nodes: SavedNode[]): Design => ({
  version: 1, nodes, edges: nodes.slice(1).map((b, i) => ({ id: `${nodes[i].id}-${b.id}`, source: nodes[i].id, target: b.id })),
})

describe('content files', () => {
  it('found the files', () => {
    expect(lessons.map((l) => l.id)).toEqual(['p99-fix', 'url-shortener'])
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
})
