# Frontend guide

A walkthrough of the System Design Trainer frontend for a backend engineer: what each tool is, which file does what, and how data moves when you click or drag something. Covers Phase 1 (the canvas).

## 1. Run it

```bash
# one-time setup: download the libraries listed in package.json into node_modules/
cd frontend && npm install

npm run dev        # dev server at http://localhost:5173, reloads on every file save
npm test           # Vitest unit tests (runs once and exits)
npx vitest         # same tests in watch mode, re-running on each save
npm run lint       # oxlint (catches common mistakes)
npm run build      # type-check + production build into frontend/dist/ (plain static files)
npm run preview    # serve the dist/ build locally, to check it
```

Backend (not needed for Phase 1; the frontend works without it):

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
curl localhost:8000/health   # {"status":"ok"}
```

## 2. The big picture

The frontend is a **single-page app**. The browser downloads one HTML page once. From then on, JavaScript draws and redraws the screen in place, with no page reloads and no server calls. Everything in Phase 1 runs in the browser tab.

```
index.html ── loads ──> src/main.tsx ── renders ──> <App/>
                                                     ├─ <Palette/>     left: block tiles
                                                     ├─ <Canvas/>      middle: React Flow
                                                     │    ├─ <BlockNode/>      one per block
                                                     │    ├─ <ContainerNode/>  region / AZ
                                                     │    └─ <RoughEdge/>      one per connection
                                                     └─ <ParamPanel/>  right: edit selected block

           all of them read and write ──>  store.ts (Zustand)  ── autosave ──> localStorage
                                                ▲
                       blocks/ (registry: what block types exist, their params)
                       design.ts (saved JSON format <-> React Flow objects)
```

A backend analogy:

- The **store** is the app's in-memory state, like a repository or cache.
- **Components** are functions from state to UI. Given the same state, they draw the same screen.
- When state changes, React re-runs the affected components and patches only the parts of the page that differ. This is a **re-render**. You never edit the page by hand.

## 3. Tools and libraries

| Tool | What it is | Where you see it |
|---|---|---|
| **Node.js + npm** | Node runs JavaScript outside the browser. npm is its package manager, like `uv`/pip. `package.json` lists dependencies and scripts, `package-lock.json` pins exact versions, and `node_modules/` holds the downloaded code (never commit it). | `frontend/package.json` |
| **Vite** | Dev server and bundler. In dev it serves `src/` files to the browser and hot-reloads on save. `npm run build` bundles everything into a few static files in `dist/`. That is why sandbox mode can be hosted as a static site. | `vite.config.ts`, `index.html` |
| **TypeScript** | JavaScript with types. The browser can't run it directly; Vite strips the types on the fly. `tsc -b` (inside `npm run build`) is the type checker. `.ts` files hold plain code; `.tsx` files also contain JSX (below). | every `src/*.ts(x)` |
| **React** | UI library. A **component** is a function that returns **JSX**, an HTML-like syntax inside TypeScript: `<div className="x">{value}</div>`. Note `className` (not `class`), and `{...}` embeds a JS expression. Components get inputs as **props**. | `App.tsx`, `panels/`, `canvas/` |
| **React hooks** | Functions named `useX` that give a component memory or side effects. `useState`: a value that survives re-renders; setting it re-renders. `useRef`: a box holding a value or DOM element without re-rendering. `useMemo`: cache a computed value until its inputs change. `useCallback`: the same for functions. They must be called at the top of a component, never inside `if`. | `ParamPanel.tsx`, `Canvas.tsx` |
| **@xyflow/react (React Flow) v13** | Node-graph canvas. It handles pan/zoom, dragging nodes, selecting, deleting (Backspace), drawing connections, and resizing. We give it `nodes` and `edges` arrays. It reports what the user did as **changes**, and we apply them with `changes.applyTo(nodes)`. Custom node/edge components decide what each one looks like. **Handles** are the small dots you drag connections from. | `canvas/`, `store.ts` |
| **Zustand** | A tiny state store. `create(...)` defines state plus functions that change it, and returns a hook. `useDesign((s) => s.nodes)` reads a slice, and the component re-renders only when that slice changes. `useDesign.getState()` reads it outside React; `useDesign.subscribe` runs code on every change, which is how autosave works. | `store.ts` |
| **rough.js** | Draws shapes with a hand-drawn wobble. Its **generator** turns "rectangle 150×64" into SVG path strings, which our components render. A fixed **seed** per node keeps the wobble the same on every render, so it doesn't jitter. | `canvas/rough.ts`, `canvas/RoughPaths.tsx` |
| **SVG** | The browser's vector drawing format. `<svg>` contains `<path d="M0 0 L10 10"/>` elements. Node shapes and edges are SVG. | `BlockNode.tsx`, `RoughEdge.tsx` |
| **CSS** | Styling, in one global file. Elements get a `className` and rules in `index.css` target it. `:root { --ink: ... }` defines color variables used as `var(--ink)`. The colors and fonts come from `docs/mockups/Main.dc.html`. | `src/index.css` |
| **Vitest** | Test runner, like pytest. `describe`/`it` group tests and `expect(x).toBe(y)` asserts. Test files end in `.test.ts` and sit next to the code they test. | `*.test.ts` |
| **oxlint** | Linter, similar to ruff. Ships with the Vite template. | `npm run lint` |
| **Browser APIs** | `localStorage`: per-site key/value storage in the browser, kept across reloads (autosave). HTML drag-and-drop (`draggable`, `onDragStart`, `onDrop`): moving palette tiles. `Blob` + a temporary `<a download>`: the Export button. `<input type="file">`: the Import button. | `store.ts`, `Palette.tsx`, `App.tsx` |
| **Google Fonts** | Kalam (hand-written headings), Inter (UI text), JetBrains Mono (code), loaded in `index.html`. | `index.html` |

## 4. Files

```
frontend/
  index.html              the one HTML page: fonts, <div id="root">, loads main.tsx
  vite.config.ts          Vite config (React plugin). Vitest reads it too.
  src/
    main.tsx              entry point: mounts <App/> into #root, inside <ReactFlowProvider>
    App.tsx               layout + header (Export / Import buttons, import error message)
    index.css             all styles
    store.ts              Zustand store: nodes, edges, actions, autosave
    design.ts             saved-design JSON format: toDesign / fromDesign / localStorage helpers
    design.test.ts        save/load round-trip + bad-input tests
    blocks/
      types.ts            BlockDef / ParamDef types, validateParam(), shared param helpers
      index.ts            the registry: list of all blocks, categories + colors, defaultParams()
      <type>.ts           one file per block type (22), with comments on where defaults come from
      registry.test.ts    registry + validation tests
    canvas/
      Canvas.tsx          <ReactFlow>, palette drops, moving nodes into/out of regions and AZs
      BlockNode.tsx       how a block looks (rough box, icon, label, replica count, handles)
      ContainerNode.tsx   how a region/AZ looks (dashed rough frame, resize handles)
      RoughEdge.tsx       how a connection looks (rough curve + arrowhead)
      rough.ts            rough.js helpers (rect/path/line, seed from node id)
      RoughPaths.tsx      renders rough.js output as SVG <path>s
    panels/
      Palette.tsx         left panel: draggable tiles grouped by category
      ParamPanel.tsx      right panel: param inputs with min/max validation
backend/
  pyproject.toml          uv project (FastAPI, uvicorn)
  app/main.py             GET /health
```

## 5. What happens when you...

**...drag a tile from the palette onto the canvas**
1. `Palette.tsx` `onDragStart` puts the block type (e.g. `"cache"`) into the browser's drag data.
2. `Canvas.tsx` `onDrop` reads it back and converts the mouse position from screen pixels to canvas coordinates with `screenToFlowPosition`. The canvas can be panned and zoomed, so the two differ.
3. `containerAt(point)` asks React Flow which region/AZ is under the point and picks the smallest, so a drop inside an AZ goes into the AZ rather than the region.
4. `store.addBlock(type, position, parentId)` creates the node with default params from the registry. A child's position is **relative to its parent's top-left corner**, which is why moving a region moves everything inside it.
5. The store changes, so `<Canvas/>` re-renders, React Flow draws the new node with `BlockNode`, and autosave writes it to localStorage.

**...drag a block into or out of a region**
`onNodeDragStop` checks which container the block's center is over. If that differs from the current parent, React Flow's `changeParent` re-parents it and recalculates the relative position, so the block stays where you dropped it.

**...connect two blocks**
Drag from the right dot (source handle) of one block to the left dot (target handle) of another. React Flow calls `onConnect` and the store adds an edge of type `rough`, which `RoughEdge` draws.

**...select a block and edit a param**
1. Clicking a node makes React Flow send a "select" change, so that node gets `selected: true`.
2. `ParamPanel` finds the selected node and looks up its block definition in the registry to know which params it has.
3. Each `ParamField` keeps the raw text you type in `useState`. On every keystroke it runs `validateParam`. If the value is valid it calls `store.setParam` and the block's label updates (e.g. `×3`); if not, the red message shows and the store keeps the last good value.

**...delete something**
Select it and press Backspace (React Flow's default). Deleting a region also deletes what's inside it.

**...reload the page**
`store.ts` calls `loadLocal()` at startup, which reads `localStorage['sysdesign.design']` and runs it through `fromDesign`. A corrupt save is ignored and you get an empty canvas.

**...Export / Import**
Export calls `toDesign(nodes, edges)`, then `JSON.stringify`, and downloads the result as `design.json`. Import reads the file, `fromDesign` validates it (version, known block types, edges point at existing nodes), and the canvas is replaced. A bad file shows a red message in the header and leaves the canvas unchanged.

## 6. Saved-design format

This is our own format, not React Flow's internal one. Lessons, explainers and the MCP tools will read it, so it shouldn't change when the library does.

```json
{
  "version": 1,
  "nodes": [
    { "id": "region_ab12", "type": "region", "position": { "x": 0, "y": 0 },
      "size": { "w": 520, "h": 340 }, "params": { "name": "us-east-1" } },
    { "id": "service_9f3k", "type": "service", "position": { "x": 40, "y": 60 },
      "parentId": "region_ab12", "params": { "replicas": 2, "capacity_rps": 1000, "base_latency_ms": 20, "timeout_ms": 1000 } }
  ],
  "edges": [{ "id": "xy-edge__service_9f3k-sql_db_c7d2", "source": "service_9f3k", "target": "sql_db_c7d2" }]
}
```

- `type` is a registry key (`blocks/<type>.ts`).
- `position` is relative to `parentId` when one is set.
- `size` appears only on regions and AZs.
- On load, params missing from the file are filled from the registry defaults, so old saves keep working when a block gains a param.

## 7. The block registry

Each block is data, not code. See `blocks/service.ts`:

```ts
export const service: BlockDef = {
  type: 'service', label: 'Service', icon: '⚙️', category: 'compute', simBehavior: 'service', cost: 0.1,
  params: [replicas(2), capacity(1000), latency(20), timeout(1000)],
}
```

- `params` drive the param panel and validation.
- `simBehavior` names the simulator handler that will run the block in Phase 2. It's only a label for now.
- `cost` is USD per replica-hour.
- The comment at the top of each file says where its numbers come from. Most are order-of-magnitude estimates.

To add a block, create `blocks/<type>.ts` and add it to the `blocks` list in `blocks/index.ts`. The `sysdesign-add-block` skill walks through it.

## 8. Debugging in the browser

- **DevTools:** press Cmd+Option+I in Chrome.
  - **Console** tab: errors and `console.log(...)` output.
  - **Elements** tab: the live page; hover to see which element is which.
  - **Application → Local Storage → http://localhost:5173 → `sysdesign.design`**: the autosaved design. Delete the key and reload to start fresh.
- **React DevTools** (Chrome extension): adds a Components tab showing each component's props and state.
- **Type errors** show in the editor and in `npx tsc -b`. The dev server does *not* stop on type errors, so run the check.
- **Dev-only double renders:** `<StrictMode>` in `main.tsx` runs some code twice in development to surface bugs. This is expected.

## 9. Glossary

- **Component:** a function returning JSX. Name starts with a capital letter.
- **Props:** a component's inputs, like function arguments.
- **State:** data that, when changed, causes a re-render.
- **Re-render:** React calling a component again and updating the page with the difference.
- **Hook:** a `useX` function that gives a component state or effects.
- **Node / edge:** a box / a connection on the React Flow canvas.
- **Handle:** a connection dot on a node.
- **Parent / child node:** a child (`parentId`) moves with its parent and is positioned relative to it.
- **Flow coordinates vs screen coordinates:** canvas space (which pans and zooms) vs pixels on your monitor.
- **Bundle / build:** Vite's output, a few static `.js`/`.css` files plus `index.html`.

## 10. Phase 1 limits

- Every block is a rough box. Per-category shapes (cylinder, cloud, diamond...) are Phase 5.
- No simulator yet. `simBehavior` is a label and there's no traffic or metrics.
- Region/AZ have no effect beyond grouping. Cross-region latency is Phase 2.
- No "clear canvas" button. Select everything (drag a box with Shift held) and press Backspace, or delete the localStorage key.
- Autosave writes on every drag frame. That's fine for designs this size; add a debounce if large designs feel slow.
- Backend has only `/health` and no tests, so `uv run pytest` reports "no tests ran" until Phase 3.
