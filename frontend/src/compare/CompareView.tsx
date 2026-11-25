// Compare mode UI (docs/mockups/Compare): two live canvases (A above B), overlaid charts under
// them, the A/B table on the right, and scenario controls in the header.
import { Background, BackgroundVariant, ConnectionMode, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type StoreApi } from 'zustand'
import { edgeTypes, nodeTypes } from '../canvas/nodeTypes'
import { fromDesign, toDesign } from '../design'
import { fmtMs, fmtPct, fmtRps } from '../display'
import { explainers } from '../lessons/content'
import { ttydUp } from '../link'
import { SimContext, type SimView } from '../simStore'
import {
  loadSide, pause, play, reset, scenarioOf, selectScenario, setSpeed, setVerdict, showHint, sides, useCompare, type Side,
} from './compareStore'
import { summarize, type Sample } from './run'

const SIDE_COLORS = ['var(--side-a)', 'var(--side-b)'] as const
const useSide = <T,>(i: number, select: (s: Side) => T) => useStore(sides[i], select)

/** Header: pick a scenario, run it on both sides, speed. */
export function CompareBar() {
  const st = useCompare()
  const sc = scenarioOf(st)
  const t = useSide(0, (s) => s.run.sim.t)
  return (
    <div className="traffic">
      <label className="traffic__ctl">Scenario
        <select className="sk" value={sc.id} onChange={(e) => selectScenario(e.target.value)}>
          {st.scenarios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="traffic__ctl">Speed
        <select className="sk" value={st.speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={1}>1×</option><option value={5}>5×</option><option value={20}>20×</option>
        </select>
      </label>
      <b className="traffic__val">{t.toFixed(1)} / {sc.seconds} s</b>
      <button className="btn sk btn--dark" onClick={st.running ? pause : play}>{st.running ? '❚❚ Pause' : '▶ Run both'}</button>
      <button className="btn sk" onClick={reset}>Reset</button>
    </div>
  )
}

/** Left column: the brief, the questions the verdict should answer, hints, the verdict. */
export function ComparePanel() {
  const st = useCompare()
  const sc = scenarioOf(st)
  const labels = [useSide(0, (s) => s.label), useSide(1, (s) => s.label)]
  const l = st.lesson
  return (
    <section className="lesson stack compare-panel">
      <div>
        <div className="caps">Compare</div>
        <div className="inspector__title">{l?.title ?? 'Two saved designs'}</div>
      </div>
      <p className="lesson__brief">{l?.brief ?? 'Side A is your sandbox design. Load another design into B (or A), pick a scenario, and run both with the same traffic.'}</p>
      <div className="compare-panel__sides">
        {labels.map((x, i) => <b key={i} style={{ color: SIDE_COLORS[i] }}>{x}</b>)}
      </div>
      {!l && <div className="explainer__nav">{[0, 1].map((i) => <LoadButton key={i} side={i as 0 | 1} />)}</div>}
      <div className="lesson__step">
        <b>{sc.label}</b>
        {sc.about && <p>{sc.about}</p>}
        {sc.watch && <p className="compare__watch"><b>Watch:</b> {sc.watch}</p>}
      </div>
      {l && l.questions.length > 0 && (
        <>
          <div className="caps">Your verdict should answer</div>
          <ul className="lesson__reqs">{l.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </>
      )}
      <label className="field">Verdict (no overall winner: it depends on the requirements)
        <textarea className="lesson__notes" rows={7} value={st.verdict} onChange={(e) => setVerdict(e.target.value)}
          placeholder="When would you pick A? When B? Ask Claude to challenge it." />
      </label>
      {l && (
        <>
          {l.hints.slice(0, st.hints).map((h, i) => <p key={i} className="lesson__hint">Hint {i + 1}: {h}</p>)}
          {st.hints < l.hints.length && <button className="btn sk" onClick={() => showHint(st.hints + 1)}>Show hint {st.hints + 1} of {l.hints.length}</button>}
          {(l.explainers ?? []).map((id) => <a key={id} href={`#/explainer/${id}`}>Watch: {explainers.find((e) => e.id === id)?.title}</a>)}
        </>
      )}
    </section>
  )
}

function LoadButton({ side }: { side: 0 | 1 }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const load = async (file?: File) => {
    if (!file) return
    try {
      const f = fromDesign(JSON.parse(await file.text())) // validates
      loadSide(side, `${'AB'[side]}: ${file.name.replace(/\.json$/, '')}`, toDesign(f.nodes, f.edges))
      setError('')
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`)
    }
    if (input.current) input.current.value = ''
  }
  return (
    <>
      <button className="btn sk" onClick={() => input.current?.click()}>Load {'AB'[side]}…</button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => load(e.target.files?.[0])} />
      {error && <span className="field__error" role="alert">{error}</span>}
    </>
  )
}

/** Center: the two canvases, then the overlaid charts. */
export function CompareView() {
  return (
    <div className="compare">
      <div className="compare__canvases">
        {[0, 1].map((i) => <MiniCanvas key={i} i={i} />)}
      </div>
      <div className="compare__charts">
        <CompareChart title="p99 latency" get={(s) => s.p99} fmt={fmtMs} log />
        <CompareChart title="p50 latency" get={(s) => s.p50} fmt={fmtMs} log />
        <CompareChart title="throughput" get={(s) => s.thr} fmt={fmtRps} />
        <CompareChart title="errors" get={(s) => s.err} fmt={fmtPct} />
      </div>
    </div>
  )
}

function MiniCanvas({ i }: { i: number }) {
  const design = useSide(i, (s) => s.run.design)
  const label = useSide(i, (s) => s.label)
  const g = useSide(i, (s) => s.sim.global)
  const flow = useMemo(() => fromDesign(design), [design])
  return (
    <div className="compare__side" style={{ borderColor: SIDE_COLORS[i] }}>
      <div className="compare__head">
        <b style={{ color: SIDE_COLORS[i] }}>{label}</b>
        <span className="muted">p99 {fmtMs(g.p99Ms)} · err {fmtPct(g.errorPct)} · {fmtRps(g.throughput)} · ${g.costHr.toFixed(2)}/hr</span>
      </div>
      <SimContext.Provider value={sides[i] as unknown as StoreApi<SimView>}>
        {/* Its own provider: each canvas is a separate React Flow instance. key: refit when the design is replaced. */}
        <ReactFlowProvider key={label}>
          <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose /* blocks only have source handles; Strict wouldn't find edge ends */} fitView fitViewOptions={{ padding: '10%' }} nodesDraggable={false} nodesConnectable={false}
            elementsSelectable={false} deleteKeyCode={null} minZoom={0.1}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line-faint)" />
          </ReactFlow>
        </ReactFlowProvider>
      </SimContext.Provider>
    </div>
  )
}

function CompareChart({ title, get, fmt, log = false }: { title: string; get: (s: Sample) => number; fmt: (n: number) => string; log?: boolean }) {
  const hist = [useSide(0, (s) => s.run.history), useSide(1, (s) => s.run.history)]
  const sc = scenarioOf(useCompare())
  const W = 300, H = 90
  const top = log ? 4 : Math.max(1e-9, ...hist.flat().map(get)) * 1.1
  const y = (v: number) => H - (log ? Math.log10(Math.max(1, Math.min(v, 10_000))) / 4 : v / top) * H
  const x = (t: number) => (t / sc.seconds) * W
  const now = hist.map((h) => (h.length ? fmt(get(h.at(-1)!)) : '–'))
  return (
    <div className="sk chart compare__chart">
      <div className="caps">{title} <span style={{ color: SIDE_COLORS[0] }}>{now[0]}</span> · <span style={{ color: SIDE_COLORS[1] }}>{now[1]}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: A ${now[0]}, B ${now[1]}`}>
        {sc.events.map((e, k) => <line key={k} x1={x(e.at)} x2={x(e.at)} y1={0} y2={H} style={{ stroke: 'var(--ink-faint)' }} strokeDasharray="3 3" />)}
        {hist.map((h, k) => (
          <polyline key={k} fill="none" style={{ stroke: SIDE_COLORS[k] }} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            strokeDasharray={k === 1 ? '6 3' : undefined} points={h.map((s) => `${x(s.t)},${y(get(s))}`).join(' ')} />
        ))}
      </svg>
    </div>
  )
}

/** Right column: the table, a winner per row, and no overall winner. */
export function CompareTable() {
  const runs = [useSide(0, (s) => s.run), useSide(1, (s) => s.run)] as const
  const labels = [useSide(0, (s) => s.label), useSide(1, (s) => s.label)]
  const sc = scenarioOf(useCompare())
  const started = runs[0].history.length > 10
  const done = runs[0].sim.t >= sc.seconds - 1e-9
  const rows = started ? summarize([runs[0], runs[1]], sc) : []
  return (
    <section className="stack" aria-label="Comparison">
      <div className="caps">A vs B · {sc.label}</div>
      {!started ? <p className="muted">Press ▶ Run both. Both sides get the same traffic and events.</p> : (
        <table className="compare__table">
          <thead><tr><th /><th style={{ color: SIDE_COLORS[0] }}>{labels[0].split(':')[0]}</th><th style={{ color: SIDE_COLORS[1] }}>{labels[1].split(':')[0]}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} title={r.about}>
                <th>{r.label}</th>
                {r.values.map((v, k) => <td key={k} className={r.winner === k ? 'win' : ''}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Bold = better on that row. Hover a row for what it measures.</p>
      {done && <NextStep />}
    </section>
  )
}


/** After a run: what to do next. Claude is the one who pushes back on the verdict. */
function NextStep() {
  const [claude, setClaude] = useState<boolean | null>(null)
  useEffect(() => { ttydUp().then(setClaude) }, [])
  return (
    <div className="compare__next" role="status">
      <b>Run finished.</b> Write your verdict on the left, then ask Claude in the terminal: "challenge my verdict".
      {claude === false && <p className="muted">Claude isn't running. Start the backend and ttyd (README, "Run"), then press ✦ Ask Claude in the header.</p>}
    </div>
  )
}
