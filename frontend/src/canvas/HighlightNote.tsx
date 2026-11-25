// Claude's highlight() message (docs/STYLE.md "Annotations"): a violet handwritten note, tilted -3°,
// with a rough arrow to the first highlighted block. It lives in the canvas's own coordinates
// (React Flow's ViewportPortal), so it pans and zooms with the block. No block found: top center.
import { useInternalNode, ViewportPortal } from '@xyflow/react'
import { useMemo } from 'react'
import { useSim } from '../simStore'
import { gen } from './rough'
import { RoughPaths } from './RoughPaths'

export function HighlightNote() {
  const { ids, message } = useSim((s) => s.highlight)
  const setHighlight = useSim((s) => s.setHighlight)
  const node = useInternalNode(ids[0] ?? '')
  const at = node?.internals.positionAbsolute
  // The pin sits 34px above the block's top-left; the note grows upward from it, and the
  // arrow runs from under the note down onto the block's top edge.
  const arrow = useMemo(() => {
    const o = { seed: 7, roughness: 1, strokeWidth: 1.8, stroke: 'var(--violet)' }
    return [gen.path('M 22 2 Q 18 18 34 30', o), gen.line(34, 30, 22, 28, o), gen.line(34, 30, 30, 19, o)]
  }, [])
  if (!message) return null
  const note = (
    <div className="hl-note" role="status">
      {message}
      <button className="hl-note__close" onClick={() => setHighlight([])} aria-label="Dismiss">✕</button>
    </div>
  )
  if (!at) return <div className="hl-note--top">{note}</div>
  return (
    <ViewportPortal>
      <div className="hl-pin" style={{ transform: `translate(${at.x}px, ${at.y - 34}px)` }}>
        <svg className="hl-pin__arrow" width="1" height="1" aria-hidden="true"><RoughPaths drawables={arrow} /></svg>
        {note}
      </div>
    </ViewportPortal>
  )
}
