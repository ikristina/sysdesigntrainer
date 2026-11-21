// The strip of alert lights along the canvas bottom. The rules are in alerts.ts.
import { useSim } from '../simStore'
import { useDesign } from '../store'
import { alerts } from './alerts'

export function AlertLights() {
  const sim = useSim((s) => s.sim)
  const killed = useSim((s) => s.killed)
  const partitioned = useSim((s) => s.partitioned)
  const nodes = useDesign((s) => s.nodes)
  return (
    <div className="alerts" aria-label="Alerts">
      {alerts({ nodes, sim, killed, partitioned }).map((a) => (
        <span key={a.label} className={`alert alert--${a.level ?? 'off'}`} aria-label={`${a.label}: ${a.level ?? 'off'}`}>{a.label}</span>
      ))}
    </div>
  )
}
