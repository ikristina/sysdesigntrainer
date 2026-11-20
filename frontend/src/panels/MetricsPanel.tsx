// Live metrics: p99 chart, headline numbers, and the most saturated blocks.
import { registry } from '../blocks'
import { fmtMs, fmtPct, fmtRps, healthColor, healthOf } from '../display'
import { useSim } from '../simStore'
import { useDesign } from '../store'

export function MetricsPanel() {
  const g = useSim((s) => s.sim.global)
  const metrics = useSim((s) => s.sim.metrics)
  const history = useSim((s) => s.history)
  const nodes = useDesign((s) => s.nodes)
  const typeOf = (id: string) => nodes.find((n) => n.id === id)?.data.blockType ?? ''
  const hasClient = nodes.some((n) => n.data.blockType === 'client')

  const lags = Object.values(metrics).flatMap((m) => (m.lagS !== undefined ? [m.lagS] : []))
  const tiles: [string, string, string?][] = [
    ['p50', fmtMs(g.p50Ms), latencyColor(g.p50Ms)],
    ['p99', fmtMs(g.p99Ms), latencyColor(g.p99Ms)],
    ['errors', fmtPct(g.errorPct), g.errorPct > 1 ? healthColor.bad : g.errorPct > 0.1 ? healthColor.warn : undefined],
    ['throughput', fmtRps(g.throughput)],
    ...(lags.length ? [['repl. lag', `${Math.max(...lags).toFixed(1)} s`, Math.max(...lags) > 1 ? healthColor.warn : undefined] as [string, string, string?]] : []),
    ['cost', `$${g.costHr.toFixed(2)}/hr`],
  ]
  const hottest = Object.entries(metrics)
    .filter(([, m]) => m.lambda > 0 && Number.isFinite(m.mu))
    .sort(([, a], [, b]) => b.rho - a.rho)
    .slice(0, 5)

  return (
    <section className="metrics" aria-label="Metrics">
      <div className="caps">p99 latency · last 60 s</div>
      {!hasClient && <p className="muted">Add a Client block, connect it, and press ▶ Run.</p>}
      <P99Chart history={history} />
      <div className="metrics__tiles">
        {tiles.map(([k, v, color]) => (
          <div key={k} className="tile-metric sk">
            <div className="muted">{k}</div>
            <div className="tile-metric__v" style={{ color }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="caps">Saturation (ρ)</div>
      {hottest.length === 0 && <p className="muted">No traffic yet.</p>}
      {hottest.map(([id, m]) => {
        const color = healthColor[healthOf(m, false)]
        return (
          <div key={id} className="sat">
            <span className="sat__name" title={id}>{registry[typeOf(id)]?.label ?? id} <span className="muted">{id.slice(-4)}</span></span>
            <div className="sat__track"><div style={{ width: `${Math.min(100, m.rho * 70)}%`, background: color }} /></div>
            <b style={{ color }}>{m.rho.toFixed(2)}</b>
          </div>
        )
      })}
    </section>
  )
}

const latencyColor = (ms: number) => (ms > 1000 ? healthColor.bad : ms > 300 ? healthColor.warn : undefined)

// Log scale: 1 ms at the bottom, 10 s at the top.
function P99Chart({ history }: { history: number[] }) {
  const W = 300, H = 110, N = 600
  const y = (ms: number) => H - (Math.log10(Math.max(1, Math.min(ms, 10_000))) / 4) * H
  const points = history.map((ms, i) => `${((i + N - history.length) / N) * W},${y(ms)}`).join(' ')
  return (
    <div className="sk chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`p99 latency over the last 60 seconds, now ${fmtMs(history.at(-1) ?? 0)}`}>
        {[10, 100, 1000].map((ms) => (
          <g key={ms}>
            <line x1={0} x2={W} y1={y(ms)} y2={y(ms)} stroke="#ECE8DE" />
            <text x={4} y={y(ms) - 3} fontSize={9} fill="#8A8578">{fmtMs(ms)}</text>
          </g>
        ))}
        <polyline points={points} fill="none" stroke={healthColor.bad} strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </div>
  )
}
