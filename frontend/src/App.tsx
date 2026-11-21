// Page layout: header (mode, traffic controls, save/load), left column | canvas (+ Claude terminal) | metrics + params.
// The left column depends on the mode: palette (sandbox), lesson panel + palette, or explainer player.
// Rendered inside <ReactFlowProvider> (see main.tsx) so it can use React Flow hooks like fitView.
import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { AlertLights } from './canvas/AlertLights'
import { Canvas } from './canvas/Canvas'
import { CompareBar, ComparePanel, CompareTable, CompareView } from './compare/CompareView'
import { toDesign } from './design'
import { ExplainerPanel } from './explainers/ExplainerPanel'
import { usePlayer } from './explainers/player'
import { compareLessons, explainers, lessons } from './lessons/content'
import { LessonPanel, StepNav, SuccessPanel } from './lessons/LessonPanel'
import { active, useLesson } from './lessons/lessonStore'
import { go, hashOf, parseHash, useMode } from './mode'
import { MetricsPanel } from './panels/MetricsPanel'
import { Palette } from './panels/Palette'
import { ParamPanel } from './panels/ParamPanel'
import { TerminalPanel } from './panels/TerminalPanel'
import { TrafficBar } from './panels/TrafficBar'
import { ttydUp } from './link'
import { useDesign } from './store'

export default function App() {
  const loadDesign = useDesign((s) => s.loadDesign)
  const { fitView } = useReactFlow()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState(false)
  useEffect(() => { ttydUp().then((up) => up && setTerminal(true)) }, []) // open it if ttyd is running
  const lessonState = useLesson()
  const mode = useMode((s) => s.mode)
  const explainer = mode.kind === 'explainer'
  const compare = mode.kind === 'compare'
  const step = usePlayer((s) => s.index)
  // New mode or explainer step = new graph: frame it. React Flow queues fitView until the nodes are measured.
  useEffect(() => { fitView({ padding: '10%', duration: 300 }) }, [mode, step, fitView])

  // Download the current design as a .json file.
  const exportFile = () => {
    const { nodes, edges } = useDesign.getState()
    const blob = new Blob([JSON.stringify(toDesign(nodes, edges), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'design.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Read a .json file picked by the user and replace the canvas with it.
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      loadDesign(JSON.parse(await file.text()))
      requestAnimationFrame(() => fitView()) // after React Flow has drawn the new nodes
      setError(null)
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`)
    }
    if (fileInput.current) fileInput.current.value = '' // allow re-importing the same file
  }

  return (
    <div className="app">
      <header className="header">
        <a className="logo" href="#/" title="Back to sandbox">sysdesign<span>/</span>trainer</a>
        <select className="mode-select sk" aria-label="Mode" value={hashOf(mode)} onChange={(e) => go(parseHash(e.target.value))}>
          <option value="#/">Sandbox (autosaved)</option>
          <optgroup label="Lessons">{lessons.map((l) => <option key={l.id} value={`#/lesson/${l.id}`}>{l.title}</option>)}</optgroup>
          <optgroup label="Compare">
            {compareLessons.map((l) => <option key={l.id} value={`#/compare/${l.id}`}>{l.title}</option>)}
            <option value="#/compare/">Two saved designs</option>
          </optgroup>
          <optgroup label="Explainers">{explainers.map((x) => <option key={x.id} value={`#/explainer/${x.id}`}>{x.title}</option>)}</optgroup>
        </select>
        {error && <span className="field__error" role="alert">{error}</span>}
        {mode.kind === 'lesson' && <StepNav />}
        {compare ? <CompareBar /> : !explainer && <TrafficBar />}
        <div className="header__actions">
          <button className="btn btn--claude sk" onClick={() => setTerminal(!terminal)} aria-pressed={terminal}>✦ Ask Claude</button>
          {!compare && <button className="btn sk" onClick={exportFile}>Export JSON</button>}
          {!explainer && !compare && <button className="btn sk" onClick={() => fileInput.current?.click()}>Import JSON</button>}
          <input ref={fileInput} type="file" accept=".json,application/json" hidden
            onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
      </header>
      <div className="body">
        {explainer ? <ExplainerPanel />
          : compare ? <div className="left"><ComparePanel /></div>
          : mode.kind === 'lesson' ? <div className="left"><LessonPanel /><Palette /></div>
            : <Palette />}
        <div className="center">
          {compare ? <CompareView /> : <main className="canvas">
            <Canvas readOnly={explainer} />
            <AlertLights />
          </main>}
          {terminal && <TerminalPanel onClose={() => setTerminal(false)} />}
        </div>
        <aside className="inspector">
          {compare ? <CompareTable /> : <MetricsPanel p99Target={mode.kind === 'lesson' && lessonState.lesson ? active(lessonState).success.p99_ms : undefined} />}
          {mode.kind === 'lesson' && <SuccessPanel />}
          {!explainer && !compare && <ParamPanel />}
        </aside>
      </div>
    </div>
  )
}
