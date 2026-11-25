// Header controls for the simulator: traffic, read/write mix, spike, kill, partition, run/pause.
import { fmtCount } from '../display'
import { SPIKE, useSim } from '../simStore'
import { useDesign } from '../store'

// The rps slider is logarithmic (10 rps to 1M rps), rounded to 2 significant digits.
const toRps = (x: number) => Number((10 ** x).toPrecision(2))

export function TrafficBar() {
  const { running, rps, readRatio, hotKey, payloadKb, followers, following, play, pause, reset, setTraffic, spike, setFlag } = useSim()
  const spiking = useSim((s) => s.sim.t < s.spikeUntil)
  const { killed, partitioned } = useSim()
  const selected = useDesign((s) => s.nodes.find((n) => n.selected))
  const read = Math.round(readRatio * 100)

  return (
    <div className="traffic">
      <label className="traffic__ctl">Traffic
        <input type="range" min={1} max={6} step={0.01} value={Math.log10(rps)}
          aria-label="Requests per second" onChange={(e) => setTraffic({ rps: toRps(Number(e.target.value)) })} />
        <b className="traffic__val">{fmtCount(rps)} rps</b>
      </label>
      <label className="traffic__ctl">Read / write
        <input type="range" min={0} max={100} step={1} value={read}
          aria-label="Read percentage" onChange={(e) => setTraffic({ readRatio: Number(e.target.value) / 100 })} />
        <b className="traffic__val">{read} / {100 - read}</b>
      </label>
      {/* Native <details>: a click-to-open panel with no JS state. */}
      <details className="traffic__more">
        <summary className="btn sk">More ▾</summary>
        <div className="traffic__pop sk">
          <label className="traffic__ctl" title="Share of all requests that go to one single key (a celebrity, a flash-sale item)">Hot key
            <input type="range" min={0} max={100} step={1} value={Math.round(hotKey * 100)}
              aria-label="Hot key percentage" onChange={(e) => setTraffic({ hotKey: Number(e.target.value) / 100 })} />
            <b className="traffic__val">{Math.round(hotKey * 100)}%</b>
          </label>
          <Num label="Payload KB" title="Response size per read. Only per-GB prices use it (CloudFront)." value={payloadKb} max={100_000}
            onChange={(v) => setTraffic({ payloadKb: v })} />
          <Num label="Followers" title="Copies each write fans out to, on edges marked fan-out on write" value={followers} max={10_000_000}
            onChange={(v) => setTraffic({ followers: v })} />
          <Num label="Following" title="Fetches each read gathers, on edges marked fan-out on read" value={following} max={100_000}
            onChange={(v) => setTraffic({ following: v })} />
        </div>
      </details>
      <button className="btn sk btn--spike" onClick={() => spike()} disabled={!running}
        title={`Multiply traffic by ${SPIKE.multiplier} for ${SPIKE.seconds} s`}>
        ⚡ {spiking ? 'Spiking…' : `Spike ×${SPIKE.multiplier}`}
      </button>
      <button className="btn sk" disabled={!selected} title={selected ? '' : 'Select a block first'}
        onClick={() => selected && setFlag('killed', selected.id, !killed.includes(selected.id))}>
        {selected && killed.includes(selected.id) ? '↺ Restore' : '✕ Kill'}
      </button>
      {selected?.data.blockType === 'region' && (
        <button className="btn sk" title="Cut the network at this region's border"
          onClick={() => setFlag('partitioned', selected.id, !partitioned.includes(selected.id))}>
          {partitioned.includes(selected.id) ? '⇹ Heal' : '⇹ Partition'}
        </button>
      )}
      <button className="btn sk btn--dark" onClick={running ? pause : play}>{running ? '❚❚ Pause' : '▶ Run'}</button>
      <button className="btn sk" onClick={reset} title="Clear queues, lag and the chart">Reset</button>
    </div>
  )
}

/** A whole-number input that ignores empty or out-of-range values. */
function Num({ label, title, value, max, onChange }: { label: string; title: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="traffic__ctl" title={title}>{label}
      <input type="number" min={0} max={max} step={1} value={value}
        onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && v >= 0 && v <= max) onChange(v) }} />
    </label>
  )
}
