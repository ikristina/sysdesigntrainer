// Study notes: docs/study-notes.md, one "## Title" per note, then "lesson:" and "category:" lines,
// then a markdown body. Claude appends to that file from the terminal; Vite hot-reloads it.

import { createElement as h, Fragment, type ReactNode } from 'react'

export type Note = { title: string; lessons: string[]; category: string; body: string }

export function parseNotes(md: string): Note[] {
  return md.split(/^## /m).slice(1).map((section) => {
    const [title, ...rest] = section.split('\n')
    const tag = (k: string) => rest.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? ''
    const body = rest.filter((l) => !/^(lesson|category):/.test(l)).join('\n').trim()
    return { title: title.trim(), lessons: tag('lesson').split(',').map((s) => s.trim()).filter(Boolean), category: tag('category') || 'Uncategorized', body }
  })
}

// Rendered as React elements, not an HTML string, so note text can never become markup.
const inline = (s: string): ReactNode[] => s.split(/(\*\*.+?\*\*|`.+?`)/).filter(Boolean).map((t, i) =>
  t.startsWith('**') && t.length > 4 ? h('b', { key: i }, t.slice(2, -2))
    : t.startsWith('`') && t.length > 2 ? h('code', { key: i }, t.slice(1, -1)) : t)
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))

// ponytail: markdown subset (paragraphs, "-" lists, "|" tables, bold, code); swap in a markdown lib if notes need more.
export function renderNote(md: string): ReactNode[] {
  return md.split(/\n\s*\n/).map((block, b) => {
    const lines = block.split('\n')
    if (lines.every((l) => l.trim().startsWith('|'))) {
      const [head, , ...rows] = lines
      return h('table', { key: b }, h('tbody', null,
        h('tr', null, ...cells(head).map((c, i) => h('th', { key: i }, ...c))),
        ...rows.map((r, j) => h('tr', { key: j }, ...cells(r).map((c, i) => h('td', { key: i }, ...c))))))
    }
    const items = lines.filter((l) => l.startsWith('- '))
    const text = lines.filter((l) => !l.startsWith('- ')).join(' ')
    return h(Fragment, { key: b },
      text ? h('p', null, ...inline(text)) : null,
      items.length ? h('ul', null, ...items.map((l, i) => h('li', { key: i }, ...inline(l.slice(2))))) : null)
  })
}
