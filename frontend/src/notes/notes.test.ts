import { describe, expect, it } from 'vitest'
import { parseNotes, toHtml } from './notes'

describe('study notes', () => {
  it('parse title, lessons and category', () => {
    const [a, b] = parseNotes('# Study notes\nintro\n\n## 301 vs 302\nlesson: url-shortener, rate-limiter\ncategory: HTTP\n\nBody **here**.\n\n## Untagged\ntext')
    expect(a).toEqual({ title: '301 vs 302', lessons: ['url-shortener', 'rate-limiter'], category: 'HTTP', body: 'Body **here**.' })
    expect(b).toMatchObject({ lessons: [], category: 'Uncategorized', body: 'text' })
  })

  it('render tables, lists and inline marks, escaping html', () => {
    expect(toHtml('| | a |\n|---|---|\n| x | `y` |')).toBe('<table><tr><th></th><th>a</th></tr><tr><td>x</td><td><code>y</code></td></tr></table>')
    expect(toHtml('Pick **302** <now>:\n- one\n- two')).toBe('<p>Pick <b>302</b> &lt;now&gt;:</p><ul><li>one</li><li>two</li></ul>')
  })
})
