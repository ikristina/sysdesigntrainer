// The 🧠 Quiz panel: pick a topic, answer one question at a time, see why after each answer.
// Replaces the right column while open, like 📓 Notes. Score lives in component state only.
import { useState } from 'react'
import { quizzes, shuffled, type Question } from './quiz'

type Run = { topic: string; questions: Question[]; i: number; picked: number | null; right: number }

export function QuizPanel() {
  const [run, setRun] = useState<Run | null>(null)
  const start = (id: string) => {
    const q = quizzes.find((x) => x.id === id)!
    setRun({ topic: q.topic, questions: shuffled(q.questions), i: 0, picked: null, right: 0 })
  }

  if (!run) return (
    <aside className="inspector quiz" aria-label="Quiz">
      <div className="inspector__title">🧠 Quiz</div>
      {quizzes.length === 0 && <p className="muted">No quizzes yet.</p>}
      {quizzes.map((q) => (
        <button key={q.id} className="btn sk quiz__topic" onClick={() => start(q.id)}>
          {q.topic} <span className="muted">· {q.questions.length} questions</span>
        </button>
      ))}
    </aside>
  )

  const done = run.i >= run.questions.length
  const q = run.questions[run.i]
  const pick = (c: number) => run.picked === null && setRun({ ...run, picked: c, right: run.right + (c === q.answer ? 1 : 0) })
  return (
    <aside className="inspector quiz" aria-label="Quiz">
      <div className="inspector__title">🧠 {run.topic}</div>
      {done ? <>
        <p className="quiz__score">{run.right} / {run.questions.length} right</p>
        <button className="btn sk" onClick={() => start(quizzes.find((x) => x.topic === run.topic)!.id)}>Try again</button>
      </> : <>
        <div className="muted">Question {run.i + 1} of {run.questions.length}</div>
        <p className="quiz__q">{q.q}</p>
        {q.choices.map((c, i) => (
          <button key={i} disabled={run.picked !== null} onClick={() => pick(i)}
            className={`btn sk quiz__choice${run.picked === null ? '' : i === q.answer ? ' quiz__choice--right' : i === run.picked ? ' quiz__choice--wrong' : ''}`}>
            {c}
          </button>
        ))}
        {run.picked !== null && <div className="quiz__why">
          <b>{run.picked === q.answer ? 'Right.' : 'Not quite.'}</b> {q.why}
          {q.note && <div className="muted">From the note “{q.note}”.</div>}
          <button className="btn sk" onClick={() => setRun({ ...run, i: run.i + 1, picked: null })}>
            {run.i + 1 < run.questions.length ? 'Next' : 'See score'}
          </button>
        </div>}
      </>}
      <button className="btn sk" onClick={() => setRun(null)}>All topics</button>
    </aside>
  )
}
