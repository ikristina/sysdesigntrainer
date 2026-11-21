// Study notes: docs/study-notes.md, one "## Title" per note, then "lesson:" and "category:" lines,
// then a markdown body. Claude appends to that file from the terminal; Vite hot-reloads it.

export type Note = { title: string; lessons: string[]; category: string; body: string }

export function parseNotes(md: string): Note[] {
  return md.split(/^## /m).slice(1).map((section) => {
    const [title, ...rest] = section.split('\n')
    const tag = (k: string) => rest.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? ''
    const body = rest.filter((l) => !/^(lesson|category):/.test(l)).join('\n').trim()
    return { title: title.trim(), lessons: tag('lesson').split(',').map((s) => s.trim()).filter(Boolean), category: tag('category') || 'Uncategorized', body }
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))

// ponytail: markdown subset (paragraphs, "-" lists, "|" tables, bold, code); swap in `marked` if notes need more.
export function toHtml(md: string): string {
  return md.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n')
    if (lines.every((l) => l.trim().startsWith('|'))) {
      const [head, , ...rows] = lines
      return `<table><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
    }
    const items = lines.filter((l) => l.startsWith('- '))
    const text = lines.filter((l) => !l.startsWith('- ')).join(' ')
    return (text ? `<p>${inline(text)}</p>` : '') + (items.length ? `<ul>${items.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>` : '')
  }).join('')
}
