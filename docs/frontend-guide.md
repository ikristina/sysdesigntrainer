# Frontend guide

A walkthrough of the System Design Trainer frontend for a backend engineer: what each tool is, which file does what, and how data moves when you click or drag something. Covers Phase 1 (the canvas), Phase 2 (the simulator) and Phase 3 (the Claude link).

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

Backend and Claude terminal (only for Claude coaching; the frontend works fully without them, see section 8):

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
curl localhost:8000/health   # {"status":"ok"}
ttyd -W -O -i lo0 -p 7681 claude   # from the repo root
```

## 2. The big picture

The frontend is a **single-page app**. The browser downloads one HTML page once. From then on, JavaScript draws and redraws the screen in place, with no page reloads. The design, the simulator and all the controls run in the browser tab. The backend only exists so Claude can see and poke the tab (section 8).

```
index.html ── loads ──> src/main.tsx ── renders ──> <App/>
                                                     ├─ <Palette/>     left: block tiles
                                                     ├─ <Canvas/>      middle: React Flow
                                                     │    ├─ <BlockNode/>      one per block
                                                     │    ├─ <ContainerNode/>  region / AZ
                                                     │    └─ <RoughEdge/>      one per connection
                                                     ├─ <TrafficBar/>  header: traffic, spike, kill, run
                                                     └─ right column: <MetricsPanel/> + <ParamPanel/>

           all of them read and write ──>  store.ts (Zustand)  ── autosave ──> localStorage
                                                ▲
                       blocks/ (registry: what block types exist, their params)
                       design.ts (saved JSON format <-> React Flow objects)

  simStore.ts (Zustand) ── every 100 ms ──> sim/engine.ts step(design, state) ──> new metrics
       ▲ traffic, killed nodes                                         │
       └──── BlockNode / RoughEdge / MetricsPanel read the metrics ◄────┘

  link.ts ── WebSocket :8000/ws ──> backend mirror ◄── MCP :8000/mcp ── claude (in ttyd)
     │  every 1 s: design + metrics snapshot ─►                             ▲
     └─ ◄─ commands (set_traffic, kill_node, highlight...) applied to simStore
  <TerminalPanel/> under the canvas = <iframe> of ttyd :7681 ──────────────┘

  mode.ts: URL hash #/  |  #/lesson/<id>  |  #/explainer/<id>
     ├─ sandbox:   store.open('sysdesign.design')            (your autosaved design)
     ├─ lesson:    lessons/lessonStore.ts ── store.open('sysdesign.lesson.<id>', starter graph)
     │               left: <LessonPanel/> + <Palette/>, header: <StepNav/>, right: + <SuccessPanel/>
     └─ explainer: explainers/player.ts ── store.open(null, step's graph)   (never saved)
                     left: <ExplainerPanel/>, canvas read-only, no traffic bar
  lesson + explainer JSON: repo-root lessons/ and explainers/, bundled in by Vite (import.meta.glob)
```

The app has three **modes**, picked from the menu at the top left. Sandbox is the free canvas. A lesson and an explainer reuse the same canvas, stores and simulator; they only decide which design is loaded, what the left column shows, and what traffic is set. Section 9 explains them.

There are two stores. `store.ts` holds the design (what you drew, saved). `simStore.ts` holds the run (traffic settings, killed nodes, latest metrics, not saved). The simulator itself (`sim/`) is plain TypeScript with no React, so it can be unit-tested like any pure function.

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
| **`setInterval`** | Browser timer: runs a function every N ms. The sim's tick loop is one `setInterval(tick, 100)`, started by ▶ Run and cleared by Pause. | `simStore.ts` |
| **CSS animations** | `@keyframes` define a motion; `animation: name 1s infinite` plays it. The moving dashes on edges animate `stroke-dashoffset`, saturated blocks shake, and failing edges drop red dots. All CSS, no JS per frame. `prefers-reduced-motion` turns them off for people who ask their OS for less motion. | `index.css` |
| **WebSocket** | A connection that stays open so both sides can send messages at any time (HTTP is one request, one response). `new WebSocket(url)` with `onopen`/`onmessage`/`onclose` handlers. `link.ts` uses one to stream state to the backend and receive Claude's commands. | `link.ts` |
| **`<iframe>`** | A web page inside a web page. The Claude panel is ttyd's page in an iframe. The browser keeps the two pages apart (different ports = different **origins**), so our code can't read or type into the terminal, which is fine: Claude talks to the app over MCP, not through the terminal. | `TerminalPanel.tsx` |
| **`fetch(url, { mode: 'no-cors' })`** | `fetch` is the browser's HTTP client. `no-cors` lets us call another origin without permission to read the answer. We only want to know whether ttyd answers at all, before showing the iframe. | `link.ts` (`ttydUp`) |
| **`import.meta.glob`** | A Vite feature: `import.meta.glob('../../../lessons/*.json', { eager: true })` imports every matching file at build time, as if you had written one `import` per file. Lessons and explainers are plain JSON files in the repo, and adding one needs no code change. They end up inside the built JavaScript, so the static build still needs no server. `server.fs.allow` in `vite.config.ts` lets the dev server read those folders, which sit outside `frontend/`. | `lessons/content.ts`, `vite.config.ts` |
| **URL hash routing** | The part of the URL after `#` (`location.hash`) never goes to a server, and changing it doesn't reload the page. The browser fires a `hashchange` event instead. `mode.ts` keeps the mode there (`#/lesson/url-shortener`), so a reload keeps your place, Back/Forward switch modes, and you can bookmark a lesson. No router library. | `mode.ts` |
| **`<select>` / `<optgroup>`, `<textarea>`** | Native form controls: the mode menu (grouped into Lessons and Explainers) and the per-step notes box. A **controlled** input gets `value` from the store and calls a store function in `onChange`, so the store stays the single source of truth. | `App.tsx`, `LessonPanel.tsx` |
| **Google Fonts** | Kalam (hand-written headings), Inter (UI text), JetBrains Mono (code), loaded in `index.html`. | `index.html` |

## 4. Files

```
frontend/
  index.html              the one HTML page: fonts, <div id="root">, loads main.tsx
  vite.config.ts          Vite config (React plugin; fs.allow for ../lessons, ../explainers). Vitest reads it too.
  src/
    main.tsx              entry point: opens the mode in the URL hash, starts the backend link, mounts <App/>
    App.tsx               layout + header (mode menu, Claude / Export / Import), left column per mode, highlight note
    mode.ts               sandbox / lesson / explainer, kept in the URL hash; entering a mode resets the run
    link.ts               tutor layer: WebSocket to the backend, state snapshots out, MCP commands in
    index.css             all styles
    store.ts              Zustand store: nodes, edges, actions; open(key) swaps designs, autosave to that key
    simStore.ts           Zustand store for the run: traffic, killed/partitioned, highlight, tick loop, latest SimState
    display.ts            number formatting + green/amber/red health scale
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
    sim/
      types.ts            Flow, SimNode, NodeMetrics, Handler types
      engine.ts           step(): one tick of the whole graph; cost per hour
      engine.test.ts      simulator tests (saturation, retries, cache, LB, SQL, queue, stream, regions)
      handlers/
        common.ts         queueStep() (the queue model), latency formula, helpers
        index.ts          simBehavior name -> handler
        client.ts service.ts balancer.ts cache.ts sql.ts queue.ts stream.ts
    panels/
      Palette.tsx         left panel: draggable tiles grouped by category
      ParamPanel.tsx      right column, bottom: param inputs with min/max validation
      MetricsPanel.tsx    right column, top: p99 chart, headline numbers, most saturated blocks
      TrafficBar.tsx      header: traffic and read/write sliders, Spike, Kill/Restore, Partition/Heal, Run/Pause, Reset
      TerminalPanel.tsx   under the canvas: ttyd iframe, or how to start it; link status line
    lessons/
      content.ts          loads lessons/*.json, explainers/*.json and graphs; types; checks(); step titles + prompts
      content.test.ts     every file is valid, and the sim agrees with each explainer and lesson (see section 9)
      lessonStore.ts      open lesson: variant, step, notes, hints shown, pass timer; saved per lesson
      LessonPanel.tsx     <LessonPanel/> (left), <StepNav/> (header pills), <SuccessPanel/> (right)
    explainers/
      ops.ts              applyStep(): one explainer step's ops (graph, add, remove, set_params, traffic, kill, highlight)
      player.ts           which explainer and step is showing; pushes each step into the stores
      ExplainerPanel.tsx  left column: caption, Back / Next, step list, "Open in sandbox", related lessons
lessons/                  (repo root) lesson JSON: url-shortener, welcome-emails, p99-fix, rate-limiter
explainers/               (repo root) explainer JSON: load-balancing, caching-basics, replication-lag
  graphs/                 starting designs (saved-design format) used by explainers and lesson starters
backend/
  pyproject.toml          uv project (FastAPI, uvicorn, mcp)
  app/main.py             FastAPI app: GET /health, WebSocket /ws, mounts the MCP server at /mcp
  app/tools.py            the MCP tools Claude calls, and the mirror (last snapshot + open sockets)
  tests/test_link.py      mirror, commands, lesson tools, origin check
.mcp.json                 (repo root) tells `claude` the sysdesign server is at http://localhost:8000/mcp
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

**...press ▶ Run**
1. `simStore.play()` starts a timer that calls `tick()` every 100 ms.
2. `tick()` turns the current design into the saved format (`toDesign`) and calls `step(design, previousState, { traffic, killed })` from `sim/engine.ts`.
3. `step` returns a new `SimState`: per-node metrics (λ, μ, ρ, queue, latency, errors), rps per edge, and global numbers (p50, p99, error %, throughput, cost).
4. The store saves it, so every component that reads metrics re-renders: blocks recolor, edges change width and speed, and the metrics panel updates.

**...move the Traffic slider / press Spike / Kill / Partition**
They only change `simStore` (rps, read ratio, spike end time, killed and partitioned lists). The next tick picks them up. Kill applies to the selected block; killing a region or AZ kills everything inside it. Partition appears when a region is selected. Reset clears queues, lag and the chart, not your design or settings.

**...ask Claude to do something (e.g. "kill the cache")**
1. Claude (running in ttyd) calls the MCP tool `kill_node(id="cache_x1")` on `http://localhost:8000/mcp`.
2. `backend/app/tools.py` checks the id against the last snapshot and sends `{"op": "kill_node", "args": {"id": "cache_x1"}}` down the WebSocket.
3. `link.ts` receives it and calls `useSim.getState().setFlag('killed', 'cache_x1', true)`, the same thing the Kill button does. It then sends a fresh snapshot right away.
4. The next tick simulates without the cache. Claude calls `get_metrics` a few seconds later to see the result.

**...pick a lesson from the mode menu**
1. `go()` sets `location.hash = '#/lesson/p99-fix'`. The browser fires `hashchange`, and `mode.ts` calls `enter()`.
2. `enter()` pauses and resets the sim, clears kills and highlights, and calls `startLesson('p99-fix')`.
3. `startLesson` reads saved progress from `localStorage['sysdesign.progress.p99-fix']` (variant, step, notes, hints, passed), opens the lesson's own design (`sysdesign.lesson.p99-fix`, or the starter graph the first time), and sets the traffic sliders to the variant's traffic.
4. `App` re-renders for the new mode: the lesson panel on the left, step pills in the header, success criteria on the right. Your sandbox design is untouched; switching back to Sandbox reopens it.

**...press ▶ Run load test (lesson)**
It sets the variant's traffic, resets the sim and plays. On every tick, `lessonStore.ts` checks three things: traffic is at the variant's numbers, no spike is running, and all success checks are green. If so, `heldS` grows by 0.1 s; any miss resets it to 0. At 10 s the variant is marked passed and saved. Changing the variant or the requirements restarts the timer; notes and steps don't.

**...press Next in an explainer**
`player.ts` applies the next step's ops to the current scene (`applyStep`) and pushes it into the stores: the design (never autosaved), traffic, killed list and highlight. The sim keeps running, so you see the change happen live. A step that loads a new `graph` resets the sim. Back, or clicking an earlier step, rebuilds the scene from step 1 (`sceneAt`) and resets the sim. `App` calls `fitView` after each step so the graph is framed.

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

## 7. The simulator

It's a queueing model, not real traffic: numbers per second flow through the graph. Every 100 ms of sim time (`dt = 0.1 s`) `step()` in `sim/engine.ts` does three passes:

1. **Forward**: visit blocks in graph order (clients first). Each block's **handler** (picked by its `simBehavior`) gets its inbound flow `{ read, write }` in rps and decides what it serves, what it drops, and what it sends to each child.
2. **Backward**: from the leaves up, work out each block's end-to-end latency and failure share (what a request entering that block experiences, including everything downstream).
3. **Sampling**: draw 100 random request paths per tick and keep the last 2 s of samples to get p50 and p99.

The core formulas (in `handlers/common.ts`):

- Service rate `μ = replicas × capacity_rps`. Arrival rate `λ` = sum of inbound flows. Utilization `ρ = λ / μ`.
- Latency = `base_latency / (1 - ρ)` (ρ capped at 0.99), plus time spent waiting in the queue.
- When `λ > μ`, the queue grows by `(λ - μ) × dt`. Once waiting would exceed the block's timeout, the overflow fails (errors).
- A block with `timeout_ms` also gives up on downstream calls slower than that timeout. Those count as failures for it, even though the downstream keeps working.
- Clients retry: if a share `f` failed last tick, a client with `r` retries sends `1 + f + … + f^r` times its traffic. That's how an overload becomes a retry storm, and why it can stay broken after the spike ends.

What each behavior does:

| `simBehavior` | Blocks | Behavior |
|---|---|---|
| `client` | Client | Sends its share of the global rps (split evenly between clients), plus retries. |
| `service` / `kv` / `passthrough` | Service, Worker, Function, LLM, Embeddings, NoSQL-style stores, Blob, DNS | One queue in front of `μ`; each request calls **every** child. |
| `balancer` | Load balancer | Like a service, then splits evenly across the children that are alive. |
| `gateway` | API gateway | Drops traffic above `rate_limit_rps`, then balances. |
| `cache` | Cache, CDN | Serves `hit_ratio` of reads; misses and writes go downstream. With `invalidate`, writes lower the effective hit ratio. |
| `sql` | SQL DB | Writes go to the primary only; reads spread over primary + read replicas. The connection pool caps throughput at `pool_size / base latency`. Replication lag grows while the primary is above ρ 0.8. |
| `queue` | Queue | Accepts up to its capacity; children are competing consumers. The producer only waits for the enqueue, so its latency stays low while the backlog grows. |
| `stream` | Stream | Each child is a consumer group that reads **every** message. A group can use at most `partitions` of its replicas. |

- **Regions and AZs:** an edge between two regions adds 70 ms, and between two AZs adds 1 ms (estimates).
- **Killed block:** `μ = 0`, so everything sent to it fails. Load balancers skip killed children, like a health check would.
- **Partitioned region:** every edge with exactly one end inside the region is cut. The sender sees the far side as down, so load balancers route around it, a queue can't be drained across it, and a direct call across fails. Blocks inside keep running and still serve traffic that stays inside. Cut edges show a red ✕.
- **Cost/hr:** the block's `cost × replicas` (SQL: primary + read replicas), summed.
- **Deterministic:** randomness comes from a seeded generator stored in the state, so the same inputs give the same run. That's what makes it testable.

On screen, health is green below ρ 0.85, amber up to 1, and red when saturated or failing more than 1% (`display.ts`). Edges take the color of the block they point at.

To add a behavior: write `sim/handlers/<name>.ts` (a function from `HandlerInput` to `HandlerOutput`) and register it in `sim/handlers/index.ts`. `engine.ts` doesn't change.

## 8. The Claude link (tutor layer)

Claude Code runs in a terminal under the canvas. It can't see the browser, so the app tells the backend what's on screen, and the backend gives Claude tools to read it and act on it.

**Pieces:**

| Piece | Where | What it does |
|---|---|---|
| `link.ts` | browser | Opens `ws://localhost:8000/ws`. Every second, and right after each command, it sends a snapshot: the design (saved format), traffic settings, running or paused, killed/partitioned lists, the mode, the explainer step or open lesson, and metrics rounded to 3 significant digits so Claude can read them. It applies commands from the backend to `simStore`. If the socket closes, it retries every 3 s. |
| `/ws` | `backend/app/main.py` | Keeps the latest snapshot in memory (the **mirror**). It only accepts browser connections from `localhost` pages, because any website could otherwise open a WebSocket to localhost. |
| MCP tools | `backend/app/tools.py` | `get_design`, `get_metrics` read the mirror. `run`, `set_traffic`, `spike`, `kill_node`, `restore_node`, `partition_region` and `highlight` validate their input, then send a command to the browser. Lesson tools: `get_lesson` (brief, requirements, step, notes, hints shown, live checks, pass timer, `tutor_notes`), `set_requirements` (switch variant, or change traffic / limits as a twist), `advance_step`, `give_hint(level)` (shows it in the app, returns the text). With no tab open, every tool says so; lesson tools also say so when no lesson is open. |
| `/mcp` | backend | The MCP server (official Python SDK 2.x, `MCPServer`, streamable HTTP). The SDK rejects requests whose Host/Origin isn't localhost (DNS-rebinding protection). |
| `.mcp.json` | repo root | Tells Claude Code about the server. Claude asks you to approve it the first time. |
| `TerminalPanel.tsx` | browser | Shows ttyd in an iframe, or the commands to start it. Its status line shows whether `link.ts` is connected. The panel opens by itself when ttyd is running. |

**Single source of truth:** the browser's stores. The backend never simulates or edits the design. It only relays. If two tabs are open, both get every command, and the mirror holds whichever tab reported last.

**Why it's a layer:** sandbox files (`store.ts`, `simStore.ts`, `canvas/`, `sim/`) never import `link.ts` or `TerminalPanel.tsx`. Only `main.tsx` and `App.tsx` plug them in. With no backend, the socket just fails and retries, and nothing else changes. Highlight lives in `simStore` because explainers (Phase 4) use it too.

**Try a tool by hand** (backend running, app open in a tab):

```bash
cd backend && uv run python -c "
import asyncio; from mcp import Client
async def main():
    async with Client('http://localhost:8000/mcp') as c:
        print((await c.call_tool('get_metrics', {})).content[0].text[:500])
asyncio.run(main())"
```

## 9. Lessons and explainers

Both are JSON files in the repo root. The formats are in `docs/SPEC.md` ("Lessons" and "Explainers"); the TypeScript types are at the top of `lessons/content.ts`.

**Explainer** (`explainers/<id>.json`): a short guided tour, 4 to 7 steps. Each step has a `caption` and **ops** that change the live scene: `graph` (load a starting design from `explainers/graphs/`), `add` (a block, optionally `between: [a, b]` to splice it into that edge), `remove`, `set_params`, `traffic`, `kill`, `highlight` (this step only), `spike`. The canvas is read-only; you watch. On the last step, **Open in sandbox** copies the design into your sandbox (asking first if the sandbox isn't empty), and links point to related lessons.

**Lesson** (`lessons/<id>.json`): a problem with requirement **variants** (traffic plus success criteria: p99, error %, cost per hour, and optionally `max_backlog`: the most requests or messages allowed to wait in any one block, so a queue with too few workers fails), a `twist` per variant, a three-level **hint ladder** (a question, a direction, a near-answer), and its `steps`. `mode: "full"` starts from an empty canvas and walks all 7 steps (requirements, estimation, API and data model, design, load test, twist, postmortem). `mode: "targeted"` starts from a broken `starter_graph` and skips the early steps. `_notes` holds the math behind the numbers: Claude reads it through `get_lesson`, the UI never shows it.

**Passing** means all checks green for 10 s at the variant's traffic (section 5). Each step has a notes box; notes are saved and Claude reads them, which is how the estimation scratchpad works.

**The numbers are tested, not guessed.** `content.test.ts` runs the simulator on each lesson: the starter (or a naive design) must fail, the intended design must pass, and an over-provisioned one must break the cost limit. For each explainer it checks the outcome every caption claims (for example "one server saturates at 1.5k rps"). If you change a block's defaults or the sim model, these tests tell you which lesson needs retuning.

**Add one:** drop a JSON file in `lessons/` or `explainers/`. Restart `npm run dev` (Vite doesn't watch folders outside `frontend/`, so a new file isn't noticed until then); edits to existing files also need a reload. The `sysdesign-add-lesson` skill walks through writing a lesson.

## 10. The block registry

Each block is data, not code. See `blocks/service.ts`:

```ts
export const service: BlockDef = {
  type: 'service', label: 'Service', icon: '⚙️', category: 'compute', simBehavior: 'service', cost: 0.1,
  params: [replicas(2), capacity(1000), latency(20), timeout(1000)],
}
```

- `params` drive the param panel and validation.
- `simBehavior` names the simulator handler that runs the block (see the table above).
- `cost` is USD per replica-hour.
- The comment at the top of each file says where its numbers come from. Most are order-of-magnitude estimates.

To add a block, create `blocks/<type>.ts` and add it to the `blocks` list in `blocks/index.ts`. The `sysdesign-add-block` skill walks through it.

## 11. Debugging in the browser

- **DevTools:** press Cmd+Option+I in Chrome.
  - **Console** tab: errors and `console.log(...)` output.
  - **Elements** tab: the live page; hover to see which element is which.
  - **Application → Local Storage → http://localhost:5173 → `sysdesign.design`**: the autosaved design. Delete the key and reload to start fresh.
- **React DevTools** (Chrome extension): adds a Components tab showing each component's props and state.
- **Type errors** show in the editor and in `npx tsc -b`. The dev server does *not* stop on type errors, so run the check.
- **WebSocket traffic:** DevTools → Network → filter "WS" → click `ws` → Messages shows every snapshot and command.
- **Console shows "WebSocket connection to ws://localhost:8000/ws failed" every few seconds:** the backend isn't running. That's harmless in sandbox mode.
- **Dev-only double renders:** `<StrictMode>` in `main.tsx` runs some code twice in development to surface bugs. This is expected.

## 12. Glossary

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
- **Tick:** one step of the simulator (100 ms of sim time).
- **λ / μ / ρ:** arrival rate, service rate, utilization (λ/μ). ρ ≥ 1 means a growing queue.
- **p50 / p99:** the latency half of requests beat / 99% of requests beat.
- **Origin:** scheme + host + port of a page (`http://localhost:5173`). The browser isolates pages of different origins from each other.
- **MCP (Model Context Protocol):** how Claude Code discovers and calls tools that a server offers. Here, over HTTP at `/mcp`.
- **Mirror:** the backend's copy of the browser's latest state.

## 13. Known limits

- Every block is a rough box. Per-category shapes (cylinder, cloud, diamond...) are Phase 5.
- Ignored by the simulator for now: cache `ttl_s` and `eviction`, function `cold_start_ms`, LLM `tokens_per_s`. Traffic has no payload size or hot-key skew yet (they matter for Phase 5 presets).
- p50/p99 are global, not per block. Samples include requests that fail, so a dead path can still show a low p99 next to a high error %.
- Edges that form a cycle are ignored by the simulator.
- Clients each get an equal share of the global rps.
- No "clear canvas" button. Select everything (drag a box with Shift held) and press Backspace, or delete the localStorage key.
- Autosave writes on every drag frame. That's fine for designs this size; add a debounce if large designs feel slow.
- Four lessons (URL shortener, welcome emails, p99 fix, rate limiter) and three explainers ship. The spec's news feed and chat lessons aren't written: the sim sends every request to every downstream block (no separate read and write paths), has no fan-out multiplier, and checks nothing about consistency, so it can't tell their right and wrong designs apart.
- The sim can't tell one client's requests from another's in the error check, so in the rate-limiter lesson a global limit and a per-client limit score the same.
- Without Claude, a lesson's twist is text only: it tells you what changed, but the requirements stay the same until you or Claude change them (`set_requirements`). The estimation, API and postmortem steps are notes boxes with nothing checking them; Claude reviews them.
- Explainer and lesson designs aren't validated against the registry at load time beyond what `content.test.ts` checks.
- The backend mirror refreshes once a second, so an MCP call in the first second after switching modes can see the old mode.
- Claude can't edit the design (add blocks, change params). The spec's tool list doesn't include it; ask if you want it.
- The backend doesn't serve the built frontend yet. Use `npm run dev` (or any static server for `dist/`).
- The terminal panel is a fixed 300 px tall. Reloading the app restarts Claude (ttyd starts a new `claude` per connection; see `docs/terminal-ttyd.md` for the tmux workaround).
- With the backend stopped, the browser console logs a failed WebSocket every 3 s.
