// Header controls for the simulator: traffic, read/write mix, spike, kill, run/pause.
import { fmtCount } from '../display'
import { SPIKE, useSim } from '../simStore'
import { useDesign } from '../store'

// The rps slider is logarithmic (10 rps to 1M rps), rounded to 2 significant digits.
const toRps = (x: number) => Number((10 ** x).toPrecision(2))

export function TrafficBar() {
  const { running, rps, readRatio, play, pause, reset, setRps, setReadRatio, spike, toggleKill } = useSim()
  const spiking = useSim((s) => s.sim.t < s.spikeUntil)
  const isKilled = useSim((s) => s.killed)
  const selected = useDesign((s) => s.nodes.find((n) => n.selected))
  const read = Math.round(readRatio * 100)

  return (
    <div className="traffic">
      <label className="traffic__ctl">Traffic
        <input type="range" min={1} max={6} step={0.01} value={Math.log10(rps)}
          aria-label="Requests per second" onChange={(e) => setRps(toRps(Number(e.target.value)))} />
        <b className="traffic__val">{fmtCount(rps)} rps</b>
      </label>
      <label className="traffic__ctl">Read / write
        <input type="range" min={0} max={100} step={1} value={read}
          aria-label="Read percentage" onChange={(e) => setReadRatio(Number(e.target.value) / 100)} />
        <b className="traffic__val">{read} / {100 - read}</b>
      </label>
      <button className="btn sk btn--spike" onClick={spike} disabled={!running}
        title={`Multiply traffic by ${SPIKE.multiplier} for ${SPIKE.seconds} s`}>
        ⚡ {spiking ? 'Spiking…' : `Spike ×${SPIKE.multiplier}`}
      </button>
      <button className="btn sk" disabled={!selected} title={selected ? '' : 'Select a block first'}
        onClick={() => selected && toggleKill(selected.id)}>
        {selected && isKilled.includes(selected.id) ? '↺ Restore' : '✕ Kill'}
      </button>
      <button className="btn sk btn--dark" onClick={running ? pause : play}>{running ? '❚❚ Pause' : '▶ Run'}</button>
      <button className="btn sk" onClick={reset} title="Clear queues, lag and the chart">Reset</button>
    </div>
  )
}
