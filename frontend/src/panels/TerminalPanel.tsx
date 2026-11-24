// Tutor layer: the Claude terminal under the canvas. It's ttyd's web page (http://<host>:7681) in an
// iframe; ttyd runs `claude` inside tmux from the repo root, so a reload reattaches (see docs/terminal-ttyd.md). The status line shows
// whether this tab is linked to the backend, which is how Claude's MCP tools reach the app.
// Drag the top bar to resize; the height is remembered in localStorage (per browser).
import { useEffect, useState, type PointerEvent } from 'react'
import { TTYD_URL, ttydUp, useLink } from '../link'

const TTYD_CMD = 'ttyd -W -O -i lo0 -p 7681 tmux new -A -s sysdesign claude'
const BACKEND_CMD = 'cd backend && uv run uvicorn app.main:app --reload --port 8000'
const HEIGHT_KEY = 'terminal-height'
const clampHeight = (h: number) => Math.round(Math.min(Math.max(h, 120), window.innerHeight - 120))
const savedHeight = () => { try { return Number(localStorage.getItem(HEIGHT_KEY)) || 300 } catch { return 300 } }

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const connected = useLink((s) => s.connected)
  const [up, setUp] = useState<boolean | null>(null)
  const check = () => { setUp(null); ttydUp().then(setUp) }
  useEffect(() => { ttydUp().then(setUp) }, [])
  const [height, setHeight] = useState(() => clampHeight(savedHeight()))
  // Pointer capture keeps the drag going while the pointer is over the iframe, which would
  // otherwise swallow the move events.
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const startY = e.clientY, startH = height
    const bar = e.currentTarget
    bar.onpointermove = (m) => setHeight(clampHeight(startH + startY - m.clientY))
    bar.onpointerup = (u) => {
      bar.onpointermove = bar.onpointerup = null
      try { localStorage.setItem(HEIGHT_KEY, String(clampHeight(startH + startY - u.clientY))) } catch { /* private mode: not remembered */ }
    }
  }

  return (
    <section className="terminal" aria-label="Claude terminal" style={{ height }}>
      <div className="terminal__bar" onPointerDown={drag} title="Drag to resize">
        <span>claude · {connected ? 'connected to sysdesign MCP' : 'backend not running, Claude can’t see the app'}</span>
        <span>ttyd :7681 <button className="terminal__close" onClick={onClose} aria-label="Hide terminal">✕</button></span>
      </div>
      {up ? <iframe className="terminal__frame" src={TTYD_URL} title="Claude Code" /> : (
        <div className="terminal__help">
          {up === null ? 'Looking for the terminal…' : <>
            <p>The terminal isn’t running. From the repo root, start it:</p>
            <pre>{TTYD_CMD}</pre>
            {!connected && <><p>and the backend, so Claude can see the app:</p><pre>{BACKEND_CMD}</pre></>}
            <button className="btn sk" onClick={check}>Retry</button>
          </>}
        </div>
      )}
    </section>
  )
}
