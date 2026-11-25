// Right panel, top: edit the params of the selected node.
// Each input keeps its own text while you type; the value is saved to the store only
// when it passes validation (min/max/whole number), otherwise the error shows under it.
import { useState } from 'react'
import { registry } from '../blocks'
import { validateParam, type BlockDef, type ParamDef, type ParamValue } from '../blocks/types'
import type { Edge } from '@xyflow/react'
import type { EdgeRoute } from '../design'
import { useDesign } from '../store'

export function ParamPanel() {
  // React Flow marks clicked nodes with `selected: true`; show the first one.
  const node = useDesign((s) => s.nodes.find((n) => n.selected))
  const edge = useDesign((s) => s.edges.find((e) => e.selected))
  const setParam = useDesign((s) => s.setParam)

  if (!node && edge) return <EdgePanel edge={edge} />
  if (!node) {
    return <section className="stack"><div className="caps">Selected</div><p className="muted">Click a block or a connection to edit it.</p></section>
  }
  const def = registry[node.data.blockType]
  return (
    <section className="stack" aria-label="Selected block">
      <div>
        <div className="caps">Selected</div>
        <div className="inspector__title">{def.label}</div>
        <div className="muted">{node.id} · {priceOf(def)}</div>
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

const priceOf = ({ cost, costPer, requestCost, transferCost }: BlockDef) => [
  cost > 0 || !requestCost ? `$${Number(cost.toPrecision(3))}/${costPer ?? 'replica'}-hr` : '',
  requestCost ? `$${requestCost.read}/M reads, $${requestCost.write}/M writes` : '',
  transferCost ? `$${transferCost}/GB sent` : '',
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
          {Object.entries(p.sources).map(([k, v]) => <li key={k}><b>{k}</b> {linkify(v)}</li>)}
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

// A selected connection: which requests take it, and whether it fans out.
function EdgePanel({ edge }: { edge: Edge }) {
  const setRoute = useDesign((s) => s.setRoute)
  const r = (edge.data ?? {}) as EdgeRoute
  return (
    <section className="stack" aria-label="Selected connection">
      <div>
        <div className="caps">Selected</div>
        <div className="inspector__title">Connection</div>
        <div className="muted">{edge.source} → {edge.target}</div>
      </div>
      <label className="field">
        <span className="field__row"><span>Carries</span></span>
        <select className="sk" value={r.carries ?? ''} onChange={(e) => setRoute(edge.id, { carries: (e.target.value || undefined) as EdgeRoute['carries'] })}>
          <option value="">reads and writes</option>
          <option value="read">reads only</option>
          <option value="write">writes only</option>
        </select>
      </label>
      <label className="field">
        <span className="field__row"><span>Fan-out</span></span>
        <select className="sk" value={r.fanout ?? ''} onChange={(e) => setRoute(edge.id, { fanout: (e.target.value || undefined) as EdgeRoute['fanout'] })}>
          <option value="">none: one call per request</option>
          <option value="write">on write: each write × followers</option>
          <option value="read">on read: each read × following</option>
        </select>
      </label>
      {r.fanout && (
        <label className="field field--check">
          <input type="checkbox" checked={!!r.sequential} onChange={(e) => setRoute(edge.id, { sequential: e.target.checked || undefined })} />
          <span>One after another: each call waits for the last (latency × N, like an agent loop)</span>
        </label>
      )}
      <p className="muted">Followers and following are set under More ▾ in the header. Fan-out on write copies each post into every
        follower's feed; fan-out on read gathers posts from everyone a reader follows.</p>
    </section>
  )
}
