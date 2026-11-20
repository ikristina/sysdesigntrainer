// Right panel, top: edit the params of the selected node.
// Each input keeps its own text while you type; the value is saved to the store only
// when it passes validation (min/max/whole number), otherwise the error shows under it.
import { useState } from 'react'
import { registry } from '../blocks'
import { validateParam, type ParamDef, type ParamValue } from '../blocks/types'
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
        <div className="muted mono">{node.id} · ${def.cost}/replica-hr</div>
      </div>
      {def.params.map((p) => (
        // `key` includes the node id so inputs reset when you select a different node.
        <ParamField key={`${node.id}.${p.key}`} def={p} value={node.data.params[p.key]}
          onCommit={(v) => setParam(node.id, p.key, v)} />
      ))}
    </section>
  )
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
