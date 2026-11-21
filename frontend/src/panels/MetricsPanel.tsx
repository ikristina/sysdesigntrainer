// Live metrics: readout cards (p99, errors, traffic), the p99 chart, other numbers, and the most
// saturated blocks. p99Target: the lesson's p99 limit, past which the p99 card turns coral (default 1 s).
import { registry } from '../blocks'
import { fmtMs, fmtPct, fmtRps, healthColor, healthOf } from '../display'
import { useSim } from '../simStore'
import { useDesign } from '../store'

export function MetricsPanel({ p99Target = 1000 }: { p99Target?: number }) {
  const g = useSim((s) => s.sim.global)
  const metrics = useSim((s) => s.sim.metrics)
  const history = useSim((s) => s.history)
  const nodes = useDesign((s) => s.nodes)
  const typeOf = (id: string) => nodes.find((n) => n.id === id)?.data.blockType ?? ''
  const hasClient = nodes.some((n) => n.data.blockType === 'client')

  const lags = Object.values(metrics).flatMap((m) => (m.lagS !== undefined ? [m.lagS] : []))
  const cards = [
    { k: 'p99', v: fmtMs(g.p99Ms), bg: 'var(--card-p99)', color: g.p99Ms > p99Target ? 'var(--coral-text)' : undefined },
    { k: 'errors', v: fmtPct(g.errorPct), bg: 'var(--card-errors)' },
    { k: 'traffic', v: fmtRps(g.throughput), bg: 'var(--card-traffic)' },
  ]
  const tiles: [string, string, string?][] = [
    ['p50', fmtMs(g.p50Ms), latencyColor(g.p50Ms)],
    ...(lags.length ? [['repl. lag', `${Math.max(...lags).toFixed(1)} s`, Math.max(...lags) > 1 ? healthColor.warn : undefined] as [string, string, string?]] : []),
    ...(g.stalePct > 0 ? [['stale reads', fmtPct(g.stalePct)] as [string, string]] : []),
    ['cost', `$${g.costHr.toFixed(2)}/hr`],
  ]
  const hottest = Object.entries(metrics)
    .filter(([, m]) => m.lambda > 0 && Number.isFinite(m.mu))
    .sort(([, a], [, b]) => b.rho - a.rho)
    .slice(0, 5)

  return (
    <section className="metrics" aria-label="Metrics">
      {!hasClient && <p className="muted">Add a Client block, connect it, and press ▶ Run.</p>}
      <div className="cards">
        {cards.map((c) => (
          <div key={c.k} className="card sk" style={{ background: c.bg }}>
            <div className="card__k">{c.k}</div>
            <div className="card__v" style={{ color: c.color }}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="caps">p99 latency · last 60 s</div>
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
            <line x1={0} x2={W} y1={y(ms)} y2={y(ms)} style={{ stroke: 'var(--line-faint)' }} />
            <text x={4} y={y(ms) - 3} fontSize={9} style={{ fill: 'var(--ink-muted)' }}>{fmtMs(ms)}</text>
          </g>
        ))}
        <polyline points={points} fill="none" style={{ stroke: healthColor.bad }} strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </div>
  )
}
