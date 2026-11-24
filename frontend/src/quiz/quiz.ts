// Quick quizzes: one file per topic in quizzes/<id>.json at the repo root, bundled at build time
// like lessons. Each question has choices, the index of the right one, and why it's right.
// `note` names the study note (docs/study-notes.md "## Title") the question comes from.
// weak-spots.json is the one Claude writes to as it sees you struggle (see CLAUDE.md). It's gitignored
// (the repo is public), so it may be missing or empty.
import { create } from 'zustand'

export type Question = { q: string; choices: string[]; answer: number; why: string; note?: string }
export type Quiz = { id: string; topic: string; questions: Question[] }

const files = import.meta.glob<Omit<Quiz, 'id'>>('../../../quizzes/*.json', { eager: true, import: 'default' })

export const quizzes: Quiz[] = Object.entries(files)
  .map(([path, q]) => ({ ...q, id: path.split('/').pop()!.replace(/\.json$/, '') }))
  .filter((q) => q.questions.length > 0)
  .sort((a, b) => Number(b.id === 'weak-spots') - Number(a.id === 'weak-spots') || a.topic.localeCompare(b.topic))

/** A copy in random order, so a retry isn't the same sequence. */
export function shuffled<T>(xs: T[], rand = Math.random): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// localStorage, wrapped: it can be blocked (private mode), and then nothing is remembered.
const load = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback } catch { return fallback } }
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* not remembered */ } }

// The run on screen (null = topic list or panel closed). In a store so the tutor link can send it to
// Claude, and saved so a page refresh picks up on the same question.
type Run = { topic: string; questions: Question[]; i: number; picked: number | null; right: number }
const RUN_KEY = 'quiz-run'
export const useQuiz = create<{ run: Run | null }>(() => ({ run: load<Run | null>(RUN_KEY, null) }))
export const setRun = (run: Run | null) => { useQuiz.setState({ run }); save(RUN_KEY, run) }

// Questions answered wrong, newest last, so Claude can write weak-spot questions (get_quiz).
// Answering one right later takes it off the list.
export type Miss = { topic: string; q: string; picked: string; answer: string; at: string }
const MISSES_KEY = 'quiz-misses', MAX_MISSES = 30
export const misses = () => load<Miss[]>(MISSES_KEY, [])
export function recordAnswer(topic: string, q: Question, picked: number) {
  const rest = misses().filter((m) => m.q !== q.q)
  if (picked !== q.answer) rest.push({ topic, q: q.q, picked: q.choices[picked], answer: q.choices[q.answer], at: new Date().toISOString() })
  save(MISSES_KEY, rest.slice(-MAX_MISSES))
}
