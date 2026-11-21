// Right panel, top: edit the params of the selected node.
// Each input keeps its own text while you type; the value is saved to the store only
// when it passes validation (min/max/whole number), otherwise the error shows under it.
import { useState } from 'react'
import { registry } from '../blocks'
import { validateParam, type BlockDef, type ParamDef, type ParamValue } from '../blocks/types'
import { useDesign } from '../store'

export function ParamPanel() {
  // React Flow marks clicked nodes with `selected: true`; show the first one.
  const node = useDesign((s) => s.nodes.find((n) => n.selected))
  const setParam = useDesign((s) => s.setParam)

  if (!node) {
    return <section className="stack"><div className="caps">Selected</div><p className="muted">Click a block to edit it.</p></section>
  }
  const def = registry[node.data.blockType]
  return (
    <section className="stack" aria-label="Selected block">
      <div>
        <div className="caps">Selected</div>
        <div className="inspector__title">{def.label}</div>
        <div className="muted mono">{node.id} · {priceOf(def)}</div>
      </div>
      {def.product && <ProductInfo def={def} />}
      {def.params.map((p) => (
        // `key` includes the node id so inputs reset when you select a different node.
        <ParamField key={`${node.id}.${p.key}`} def={p} value={node.data.params[p.key]}
          onCommit={(v) => setParam(node.id, p.key, v)} />
      ))}
    </section>
  )
}

const priceOf = ({ cost, costPer, requestCost }: BlockDef) => [
  cost > 0 || !requestCost ? `$${Number(cost.toPrecision(3))}/${costPer ?? 'replica'}-hr` : '',
  requestCost ? `$${requestCost.read}/M reads, $${requestCost.write}/M writes` : '',
].filter(Boolean).join(' + ')

// What makes this product different, and where its numbers come from.
function ProductInfo({ def }: { def: BlockDef }) {
  const p = def.product!
  return (
    <div className="product">
      <ul>{p.facts.map((f) => <li key={f}>{f}</li>)}</ul>
      <details>
        <summary>Sources and estimates</summary>
        <ul className="product__sources">
          {Object.entries(p.sources).map(([k, v]) => <li key={k}><b className="mono">{k}</b> {linkify(v)}</li>)}
        </ul>
        <p className="muted">{p.notes}</p>
      </details>
    </div>
  )
}

// Turn the URL at the start of a source line into a link.
function linkify(text: string) {
  const [, url, rest] = text.match(/^(https?:\/\/\S+)(.*)$/s) ?? []
  return url ? <><a href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>{rest}</> : text
}

function ParamField({ def, value, onCommit }: { def: ParamDef; value: ParamValue; onCommit: (v: ParamValue) => void }) {
  const [text, setText] = useState(String(value))
  const isNumber = typeof def.default === 'number'
  const toValue = (t: string): ParamValue => (isNumber ? (t.trim() === '' ? NaN : Number(t)) : t)
  const error = validateParam(def, toValue(text))

  const change = (t: string) => {
    setText(t)
    if (!validateParam(def, toValue(t))) onCommit(toValue(t))
  }

  return (
    <label className="field">
      <span className="field__row">
        <span>{def.label}</span>
        {def.unit && <span className="muted">{def.unit}</span>}
      </span>
      {def.options ? (
        <select value={text} onChange={(e) => change(e.target.value)}>
          {def.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={isNumber ? 'number' : 'text'}
          value={text}
          min={def.min}
          max={def.max}
          step={def.int ? 1 : 'any'}
          aria-invalid={!!error}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {error && <span className="field__error">{def.label} {error}</span>}
    </label>
  )
}
