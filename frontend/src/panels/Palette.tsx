// Left panel: every block type, grouped by category. Drag a tile onto the canvas.
// Uses the browser's built-in drag-and-drop: the tile puts the block type into the drag,
// and Canvas's onDrop reads it back.
import type { DragEvent } from 'react'
import { blocks, categories } from '../blocks'
import { DRAG_MIME } from '../canvas/Canvas'

export function Palette() {
  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside className="palette" aria-label="Blocks">
      {categories.map((c) => (
        <div key={c.id} className="palette__group">
          <div className="caps">{c.label}</div>
          <div className="palette__items">
            {blocks.filter((b) => b.category === c.id).map((b) => (
              <div
                key={b.type}
                className="tile sk"
                style={{ boxShadow: `2px 2px 0 ${c.color}` }}
                draggable
                onDragStart={(e) => onDragStart(e, b.type)}
              >
                {b.icon} {b.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
