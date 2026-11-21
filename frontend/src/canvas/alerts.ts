// Alert rules (docs/STYLE.md "Panels"), drawn by AlertLights.tsx. Each light is a rule over the
// live sim state, so it lights by itself: red = broken, amber = heading there, null = off.
import { registry } from '../blocks'
import type { FlowNode } from '../design'
import type { SimState } from '../sim/engine'

export type Level = 'red' | 'amber' | null
type In = { nodes: Pick<FlowNode, 'id' | 'data'>[]; sim: Pick<SimState, 'metrics' | 'global'>; killed: string[]; partitioned: string[] }

export function alerts({ nodes, sim: { metrics, global: g }, killed, partitioned }: In): { label: string; level: Level }[] {
  const base = (n: In['nodes'][number]) => { const d = registry[n.data.blockType]; return d?.product?.base ?? d?.type }
  const live = nodes.flatMap((n) => (metrics[n.id]?.lambda > 0 ? [{ n, m: metrics[n.id] }] : []))
  const sqlRho = Math.max(0, ...live.filter(({ n }) => base(n) === 'sql_db').map(({ m }) => m.rho))
  const lag = Math.max(0, ...live.map(({ m }) => m.lagS ?? 0))
  const sent = live.filter(({ n }) => base(n) === 'client').reduce((a, { m }) => a + m.lambda, 0)
  const retry = g.offered > 0 ? sent / g.offered : 1
  const cold = live.some(({ n, m }) => typeof n.data.params.hit_ratio === 'number' && m.hit !== undefined && m.hit < 0.5 * n.data.params.hit_ratio)
  const regionDown = partitioned.length > 0 || nodes.some((n) => killed.includes(n.id) && ['region', 'az'].includes(n.data.blockType))
  return [
    { label: 'Primary saturated', level: sqlRho >= 1 ? 'red' : sqlRho >= 0.85 ? 'amber' : null },
    { label: 'Replica lag', level: lag > 5 ? 'red' : lag > 1 ? 'amber' : null },
    { label: 'Retry storm', level: retry >= 2 ? 'red' : retry >= 1.2 ? 'amber' : null },
    { label: 'Cache cold', level: cold ? 'amber' : null },
    { label: 'Region down', level: regionDown ? 'red' : null },
  ]
}
