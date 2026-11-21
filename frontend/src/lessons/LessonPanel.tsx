// Lesson mode UI. LessonPanel: left column above the palette (brief, variant, the current step's
// guide and notes, hints). StepNav: step pills in the header. SuccessPanel: right column
// (success criteria, cost meter, pass status).
import { fmtPct } from '../display'
import { useSim } from '../simStore'
import { checks, explainers, STEP_GUIDE } from './content'
import { active, goStep, HOLD_S, isPassed, runLoadTest, setNote, setVariant, showHint, useLesson } from './lessonStore'

export function LessonPanel() {
  const st = useLesson()
  const { lesson, progress } = st
  if (!lesson) return null
  const req = active(st)
  const step = lesson.steps[progress.step]
  const guide = STEP_GUIDE[step]

  return (
    <section className="lesson stack">
      <div>
        <div className="caps">Lesson · {lesson.mode}</div>
        <div className="inspector__title">{lesson.title}</div>
      </div>
      <p className="lesson__brief">{lesson.brief}</p>
      <label className="field">Variant
        <select value={progress.variantId} onChange={(e) => setVariant(e.target.value)}>
          {lesson.variants.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
        </select>
      </label>
      <ul className="lesson__reqs">
        {req.requirements.map((r) => <li key={r}>{r}</li>)}
        {progress.custom && <li className="lesson__changed">Requirements changed (twist)</li>}
      </ul>

      <div className="lesson__step">
        <div className="caps">Step {progress.step + 1} · {guide.title}</div>
        <p>{guide.prompt}</p>
        {step === 'load_test' && (
          <button className="btn sk btn--dark" onClick={runLoadTest}>▶ Run load test</button>
        )}
        {step === 'twist' && <p className="lesson__twist">{req.twist ?? 'No twist for this variant.'}</p>}
        <textarea className="lesson__notes" rows={6} value={progress.notes[step] ?? ''}
          aria-label={`${guide.title} notes`} placeholder="Your notes (Claude can read them)"
          onChange={(e) => setNote(step, e.target.value)} />
        <div className="explainer__nav">
          <button className="btn sk" disabled={progress.step === 0} onClick={() => goStep(progress.step - 1)}>← Back</button>
          <button className="btn sk" disabled={progress.step === lesson.steps.length - 1} onClick={() => goStep(progress.step + 1)}>Next step →</button>
        </div>
      </div>

      <div className="stack">
        {lesson.hints.slice(0, progress.hints).map((h, i) => <p key={i} className="lesson__hint">Hint {i + 1}: {h}</p>)}
        {progress.hints < lesson.hints.length && (
          <button className="btn sk" onClick={() => showHint(progress.hints + 1)}>Show hint {progress.hints + 1} of {lesson.hints.length}</button>
        )}
        {(lesson.explainers ?? []).map((id) => (
          <a key={id} href={`#/explainer/${id}`}>Stuck? Watch: {explainers.find((e) => e.id === id)?.title}</a>
        ))}
      </div>
    </section>
  )
}

export function StepNav() {
  const { lesson, progress } = useLesson()
  if (!lesson) return null
  return (
    <nav className="steps" aria-label="Lesson steps">
      {lesson.steps.map((s, i) => (
        <button key={s} onClick={() => goStep(i)} aria-current={i === progress.step ? 'step' : undefined}
          className={`step${i < progress.step ? ' step--done' : ''}${i === progress.step ? ' step--current' : ''}`}>
          {i < progress.step ? '✓ ' : i === progress.step ? '● ' : ''}{STEP_GUIDE[s].title}
        </button>
      ))}
    </nav>
  )
}

export function SuccessPanel() {
  const st = useLesson()
  const g = useSim((s) => s.sim.global)
  const running = useSim((s) => s.running)
  if (!st.lesson) return null
  const { success } = active(st)
  const list = checks(g, success)
  const passed = isPassed(st)
  const costShare = Math.min(1, g.costHr / success.max_cost_hr)

  return (
    <section className="stack success">
      <div className="caps">Success criteria</div>
      {list.map((c) => (
        <div key={c.label}><span className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</span> {c.label}</div>
      ))}
      <div>
        <div className="field__row"><span>Cost</span><span>${g.costHr.toFixed(2)} of ${success.max_cost_hr}/hr</span></div>
        <div className="util util--wide" role="meter" aria-label="Cost against budget"
          aria-valuenow={g.costHr} aria-valuemax={success.max_cost_hr}>
          <div style={{ width: `${costShare * 100}%`, background: g.costHr > success.max_cost_hr ? 'var(--error)' : 'var(--ok)' }} />
        </div>
      </div>
      <div className="muted">
        {passed ? '✓ Passed at this variant’s traffic.'
          : running ? `Held ${Math.min(HOLD_S, st.heldS).toFixed(0)} of ${HOLD_S} s at the required traffic (errors ${fmtPct(g.errorPct)})`
            : 'Run the load test to check.'}
      </div>
    </section>
  )
}
