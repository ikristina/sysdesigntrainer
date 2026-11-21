// The 📓 Notes panel: study notes from docs/study-notes.md, grouped by category, filterable by lesson.
// Opens on the current lesson's notes. Notes are added by asking Claude in the terminal.
import { useState } from 'react'
import { compareLessons, lessons } from '../lessons/content'
import { useMode } from '../mode'
import { parseNotes, renderNote } from './notes'

// Eager glob instead of a plain import so a missing file is an empty list, not a build error.
const raw = Object.values(import.meta.glob<string>('../../../docs/study-notes.md', { eager: true, query: '?raw', import: 'default' }))[0] ?? ''
const notes = parseNotes(raw)
const titleOf = (id: string) => [...lessons, ...compareLessons].find((l) => l.id === id)?.title ?? id

export function NotesPanel() {
  const mode = useMode((s) => s.mode)
  const [lesson, setLesson] = useState(mode.kind === 'lesson' || mode.kind === 'compare' ? mode.id : '')
  const shown = notes.filter((n) => !lesson || n.lessons.includes(lesson))
  const categories = [...new Set(shown.map((n) => n.category))].sort()
  const tagged = [...new Set([...notes.flatMap((n) => n.lessons), lesson].filter(Boolean))]
  return (
    <aside className="inspector notes" aria-label="Study notes">
      <div className="inspector__title">📓 Study notes</div>
      <label className="field">Lesson
        <select value={lesson} onChange={(e) => setLesson(e.target.value)}>
          <option value="">All lessons ({notes.length})</option>
          {tagged.map((id) => <option key={id} value={id}>{titleOf(id)}</option>)}
        </select>
      </label>
      {shown.length === 0 && <p className="muted">No notes here yet.</p>}
      {categories.map((c) => (
        <section key={c} className="notes__cat">
          <div className="caps">{c}</div>
          {shown.filter((n) => n.category === c).map((n) => (
            <details key={n.title} className="note">
              <summary>{n.title}</summary>
              {!lesson && n.lessons.length > 0 && <div className="muted">{n.lessons.map(titleOf).join(', ')}</div>}
              <div className="note__body">{renderNote(n.body)}</div>
            </details>
          ))}
        </section>
      ))}
      <p className="muted">To add one, tell Claude: “save that to my study notes”.</p>
    </aside>
  )
}
