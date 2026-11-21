import { describe, expect, it } from 'vitest'
import type { PathMetrics, SimState } from '../sim/engine'
import { alerts } from './alerts'

const node = (id: string, blockType: string, params = {}) => ({ id, data: { blockType, params } })
const m = (o: Partial<PathMetrics>) => ({ lambda: 100, mu: 1000, rho: 0.1, queue: 0, served: 100, dropped: 0, baseMs: 1, latencyMs: 1, pathMs: 1, pathFail: 0, ...o })
const sim = (metrics: Record<string, PathMetrics>, offered = 100) =>
  ({ metrics, global: { offered, throughput: 0, errorPct: 0, p50Ms: 0, p99Ms: 0, costHr: 0, stalePct: 0, fanoutRps: 0 } }) as Pick<SimState, 'metrics' | 'global'>
const levels = (a: ReturnType<typeof alerts>) => Object.fromEntries(a.map((x) => [x.label, x.level]))

describe('alert lights', () => {
  const nodes = [node('c', 'client'), node('db', 'postgres'), node('r', 'redis', { hit_ratio: 0.8 }), node('reg', 'region')]

  it('are all off on a healthy run', () => {
    const quiet = sim({ c: m({}), db: m({ rho: 0.5, lagS: 0.2 }), r: m({ hit: 0.78 }) })
    expect(Object.values(levels(alerts({ nodes, sim: quiet, killed: [], partitioned: [] })))).toEqual([null, null, null, null, null])
  })

  it('light from sim state', () => {
    const bad = sim({ c: m({ lambda: 250 }), db: m({ rho: 1.2, lagS: 2 }), r: m({ hit: 0.2 }) })
    expect(levels(alerts({ nodes, sim: bad, killed: ['reg'], partitioned: [] }))).toEqual({
      'Primary saturated': 'red', 'Replica lag': 'amber', 'Retry storm': 'red', 'Cache cold': 'amber', 'Region down': 'red',
    })
  })
})
