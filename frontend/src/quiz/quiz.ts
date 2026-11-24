// Quick quizzes: one file per topic in quizzes/<id>.json at the repo root, bundled at build time
// like lessons. Each question has choices, the index of the right one, and why it's right.
// `note` names the study note (docs/study-notes.md "## Title") the question comes from.

export type Question = { q: string; choices: string[]; answer: number; why: string; note?: string }
export type Quiz = { id: string; topic: string; questions: Question[] }

const files = import.meta.glob<Omit<Quiz, 'id'>>('../../../quizzes/*.json', { eager: true, import: 'default' })

export const quizzes: Quiz[] = Object.entries(files)
  .map(([path, q]) => ({ ...q, id: path.split('/').pop()!.replace(/\.json$/, '') }))
  .sort((a, b) => a.topic.localeCompare(b.topic))

/** A copy in random order, so a retry isn't the same sequence. */
export function shuffled<T>(xs: T[], rand = Math.random): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
