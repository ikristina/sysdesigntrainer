// Left column in explainer mode: caption, Back/Next, and at the end "Open in sandbox" plus related lessons.
import { loadLocal, SANDBOX_KEY, saveLocal, toDesign } from '../design'
import { lessons } from '../lessons/content'
import { go } from '../mode'
import { useDesign } from '../store'
import { goStep, usePlayer } from './player'

function openInSandbox() {
  const { nodes, edges } = useDesign.getState()
  if (loadLocal(SANDBOX_KEY)?.nodes.length && !confirm('Replace your sandbox design with this one?')) return
  saveLocal(SANDBOX_KEY, toDesign(nodes, edges))
  go({ kind: 'sandbox' })
}

export function ExplainerPanel() {
  const { explainer: e, index } = usePlayer()
  if (!e) return null
  const last = index === e.steps.length - 1

  return (
    <aside className="palette explainer">
      <div className="caps">Explainer · step {index + 1} of {e.steps.length}</div>
      <div className="inspector__title">{e.title}</div>
      <p className="explainer__caption" aria-live="polite">{e.steps[index].caption}</p>
      <div className="explainer__nav">
        <button className="btn sk" onClick={() => goStep(index - 1)} disabled={index === 0}>← Back</button>
        <button className="btn sk btn--dark" onClick={() => goStep(index + 1)} disabled={last}>Next →</button>
      </div>
      <ol className="explainer__steps">
        {e.steps.map((s, i) => (
          <li key={i}><button className={i === index ? 'is-current' : ''} onClick={() => goStep(i)}>{s.caption.split('. ')[0]}</button></li>
        ))}
      </ol>
      {last && (
        <div className="stack">
          <button className="btn sk" onClick={openInSandbox}>Open in sandbox</button>
          {(e.lessons ?? []).map((id) => (
            <a key={id} href={`#/lesson/${id}`}>Try the lesson: {lessons.find((l) => l.id === id)?.title}</a>
          ))}
        </div>
      )}
    </aside>
  )
}
