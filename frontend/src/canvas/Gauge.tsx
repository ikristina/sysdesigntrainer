// The small 270° dial at a block's top-right corner (docs/STYLE.md "Gauges"): live ρ.
// The arc is full at ρ 1.5, so an overloaded block reads as "past the red line", not just "full".
const ARC = 66 // 270° of a circle with r = 14 (circumference 88)

export function Gauge({ rho }: { rho: number }) {
  const level = rho >= 1 ? 'bad' : rho >= 0.85 ? 'warn' : 'ok'
  const color = { ok: 'var(--ok)', warn: 'var(--amber)', bad: 'var(--coral)' }[level]
  const text = { ok: 'var(--ok-text)', warn: 'var(--amber-text)', bad: 'var(--coral-text)' }[level]
  return (
    <div className="gauge" aria-label={`ρ ${rho.toFixed(2)}`}>
      <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="14" strokeWidth="5" strokeDasharray={`${ARC} 88`} transform="rotate(135 20 20)" strokeLinecap="round"
          style={{ fill: 'var(--panel)', stroke: 'var(--line-faint)' }} />
        <circle cx="20" cy="20" r="14" strokeWidth="5" strokeDasharray={`${(ARC * Math.min(rho / 1.5, 1)).toFixed(1)} 88`}
          transform="rotate(135 20 20)" strokeLinecap="round" style={{ fill: 'none', stroke: color }} />
      </svg>
      <div className="gauge__v" style={{ color: text }}>{rho >= 10 ? '10+' : rho.toFixed(2)}</div>
    </div>
  )
}
