// Page layout: header (save/load), palette | canvas | param panel.
// Rendered inside <ReactFlowProvider> (see main.tsx) so it can use React Flow hooks like fitView.
import { useReactFlow } from '@xyflow/react'
import { useRef, useState } from 'react'
import { Canvas } from './canvas/Canvas'
import { toDesign } from './design'
import { Palette } from './panels/Palette'
import { ParamPanel } from './panels/ParamPanel'
import { useDesign } from './store'

export default function App() {
  const loadDesign = useDesign((s) => s.loadDesign)
  const { fitView } = useReactFlow()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

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
        <div className="logo">sysdesign<span>/</span>trainer</div>
        <span className="muted">sandbox · autosaved</span>
        {error && <span className="field__error" role="alert">{error}</span>}
        <div className="header__actions">
          <button className="btn sk" onClick={exportFile}>Export JSON</button>
          <button className="btn sk" onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden
            onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
      </header>
      <div className="body">
        <Palette />
        <main className="canvas"><Canvas /></main>
        <ParamPanel />
      </div>
    </div>
  )
}
