// How simulator numbers are shown: formatting and the green/amber/red health scale.
// Pure functions, used by the canvas, the panels and the simulator's notes.

export const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
export const fmtRps = (n: number) => `${fmtCount(n)}/s`
export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`)
export const fmtPct = (p: number) => (p > 0 && p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`)

export type Health = 'idle' | 'ok' | 'warn' | 'bad' | 'dead'
export const healthColor: Record<Health, string> = {
  idle: '#1E1E1E', ok: '#2B8A3E', warn: '#E8590C', bad: '#C92A2A', dead: '#ADB5BD',
}

/** bad = saturated or failing more than 1% here; warn = ρ ≥ 0.85. */
export function healthOf(m: { lambda: number; rho: number; dropped: number } | undefined, killed: boolean): Health {
  if (killed) return 'dead'
  if (!m || m.lambda <= 0) return 'idle'
  if (m.rho >= 1 || m.dropped / m.lambda > 0.01) return 'bad'
  return m.rho >= 0.85 ? 'warn' : 'ok'
}
