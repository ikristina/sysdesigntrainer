import { describe, expect, it } from 'vitest'
import { parseNotes } from '../notes/notes'
import { quizzes, rightLast, shuffled } from './quiz'

const all = Object.entries(import.meta.glob<{ topic: string; questions: unknown[] }>('../../../quizzes/*.json', { eager: true, import: 'default' }))

const raw = Object.values(import.meta.glob<string>('../../../docs/study-notes.md', { eager: true, query: '?raw', import: 'default' }))[0] ?? ''
const noteTitles = parseNotes(raw).map((n) => n.title)

describe('quizzes', () => {
  it('every question is well-formed and points at a real study note', () => {
    expect(quizzes.length).toBeGreaterThan(0)
    for (const quiz of quizzes) {
      expect(quiz.topic).toBeTruthy()
      for (const q of quiz.questions) {
        expect(q.choices.length, q.q).toBeGreaterThanOrEqual(2)
        expect(new Set(q.choices).size, q.q).toBe(q.choices.length)
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, q.q).toBe(true)
        expect(q.why, q.q).toBeTruthy()
        if (q.note) expect(noteTitles, q.q).toContain(q.note)
      }
    }
  })

  it('every hand-written topic has at least 3 questions; weak-spots (local, gitignored) may be empty or missing', () => {
    for (const [path, quiz] of all) if (!path.endsWith('/weak-spots.json')) expect(quiz.questions.length, path).toBeGreaterThanOrEqual(3)
  })

  it('questions answered right go last', () => {
    const qs = ['a', 'b', 'c', 'd'].map((q) => ({ q, choices: ['x', 'y'], answer: 0, why: '.' }))
    const order = rightLast(qs, new Set(['a', 'c'])).map((q) => q.q)
    expect(order.slice(0, 2).sort()).toEqual(['b', 'd'])
    expect(order.slice(2).sort()).toEqual(['a', 'c'])
  })

  it('shuffled keeps every item', () => {
    expect(shuffled([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4])
  })
})
