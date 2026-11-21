import { describe, expect, it } from 'vitest'
import type { Design } from '../design'
import { memoryCost, recovery, runScenario, swapped, type Sample } from './run'

const d: Design = { version: 1, nodes: [
  { id: 'c', type: 'client', position: { x: 0, y: 0 }, params: {} },
  { id: 'k', type: 'redis', position: { x: 0, y: 0 }, params: { persistence: 'aof', replicas: 2 } },
], edges: [{ id: 'c-k', source: 'c', target: 'k' }] }

describe('compare runs', () => {
  it('swapping a block keeps only the params the new block has', () => {
    expect(swapped(d, 'k', 'memcached').nodes[1]).toMatchObject({ type: 'memcached', params: { replicas: 2 } })
    expect(swapped(d, 'k', 'memcached').nodes[1].params).not.toHaveProperty('persistence')
  })

  it('memory cost per GB: a replica doubles it, Memcached has none, no cache gives null', () => {
    const withReplica = { ...d, nodes: [d.nodes[0], { ...d.nodes[1], params: { replicas: 2, replication: 'replica' } }] }
    expect(memoryCost(withReplica)).toBeCloseTo((2 * 0.219) / 13.07)
    expect(memoryCost(swapped(withReplica, 'k', 'memcached'))).toBeCloseTo(0.219 / 13.07)
    expect(memoryCost({ ...d, nodes: [d.nodes[0]] })).toBeNull()
  })

  it('set_params skips params the block does not have', () => {
    const r = runScenario(swapped(d, 'k', 'memcached'), { id: 's', label: '', seconds: 1, traffic: { rps: 100, read_ratio: 1 },
      events: [{ at: 0.5, set_params: { k: { persistence: 'aof', replicas: 3 } } }] })
    expect(r.design.nodes[1].params).toMatchObject({ replicas: 3 })
    expect(r.design.nodes[1].params).not.toHaveProperty('persistence')
  })

  it('recovery: time from the event to the last unhealthy sample; Infinity if still unhealthy', () => {
    const s = (t: number, p99: number, err = 0): Sample => ({ t, p99, err, p50: 0, thr: 0, cost: 0, backlog: 0 })
    // A sample's t is the end of its tick, so the one at t = 10 is the last before an event at 10 s.
    expect(recovery([s(10, 50), s(10.1, 500), s(14, 500), s(15, 50)], 10)).toBeCloseTo(4)
    expect(recovery([s(10, 50), s(10.1, 500), s(15, 500)], 10)).toBe(Infinity)
    expect(recovery([s(10, 50), s(10.1, 60)], 10)).toBe(0)
  })
})
