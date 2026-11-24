// Tutor layer: the Claude terminal under the canvas. It's ttyd's web page (http://<host>:7681) in an
// iframe; ttyd runs `claude` inside tmux from the repo root, so a reload reattaches (see docs/terminal-ttyd.md). The status line shows
// whether this tab is linked to the backend, which is how Claude's MCP tools reach the app.
import { useEffect, useState } from 'react'
import { TTYD_URL, ttydUp, useLink } from '../link'

const TTYD_CMD = 'ttyd -W -O -i lo0 -p 7681 tmux new -A -s sysdesign claude'
const BACKEND_CMD = 'cd backend && uv run uvicorn app.main:app --reload --port 8000'

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const connected = useLink((s) => s.connected)
  const [up, setUp] = useState<boolean | null>(null)
  const check = () => { setUp(null); ttydUp().then(setUp) }
  useEffect(() => { ttydUp().then(setUp) }, [])

  return (
    <section className="terminal" aria-label="Claude terminal">
      <div className="terminal__bar">
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
