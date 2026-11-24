import { describe, expect, it } from 'vitest'
import { parseNotes } from '../notes/notes'
import { quizzes, shuffled } from './quiz'

const raw = Object.values(import.meta.glob<string>('../../../docs/study-notes.md', { eager: true, query: '?raw', import: 'default' }))[0] ?? ''
const noteTitles = parseNotes(raw).map((n) => n.title)

describe('quizzes', () => {
  it('every question is well-formed and points at a real study note', () => {
    expect(quizzes.length).toBeGreaterThan(0)
    for (const quiz of quizzes) {
      expect(quiz.topic).toBeTruthy()
      expect(quiz.questions.length).toBeGreaterThanOrEqual(3)
      for (const q of quiz.questions) {
        expect(q.choices.length, q.q).toBeGreaterThanOrEqual(2)
        expect(new Set(q.choices).size, q.q).toBe(q.choices.length)
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, q.q).toBe(true)
        expect(q.why, q.q).toBeTruthy()
        if (q.note) expect(noteTitles, q.q).toContain(q.note)
      }
    }
  })

  it('shuffled keeps every item', () => {
    expect(shuffled([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4])
  })
})
