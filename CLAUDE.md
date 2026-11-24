# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Design Trainer

Local web app for learning system design interactively. Drag blocks onto a canvas, connect them, run simulated load, watch it break, fix it. Claude Code runs in an embedded terminal and talks to the app over MCP to coach, check steps, change requirements and inject load.

Full spec: `docs/SPEC.md`. Read it before starting any phase.

Visual style: `docs/STYLE.md` ("cute sketchbook": pastel category fills, plum ink, Shantell Sans, gauges, alert lights). Its mockups are `docs/mockups/StyleCute.dc.html` (scene under load) and `docs/mockups/Products.dc.html` (product blocks). Every color and font is a token in `frontend/src/tokens.css`; components use `var(--token)`, never hex values. The older mockups (`Main`, `Breaking`, `Compare`) still show the screen layout and panel structure, not the look. The `.dc.html` files are design-tool sources: read them for values and structure, don't copy the markup. They won't run standalone.

## Stack
- Backend: Python 3.12+, FastAPI, official `mcp` Python SDK (FastMCP), uv for deps
- Frontend: React + TypeScript + Vite, `@xyflow/react` (React Flow), rough.js for hand-drawn style, Zustand for state
- Terminal: ttyd running `claude`, embedded via iframe
- Simulator: TypeScript, runs in the browser. Backend never simulates.

## Layout
```
backend/      FastAPI app, MCP server, websocket state sync
frontend/     React app (canvas, sim, panels)
  src/blocks/          block registry (one file per block type)
  src/blocks/presets/  product presets (<product>.ts: Redis, Kafka, ...) over a generic block
  src/sim/             simulator engine, pure functions, no React
  src/sim/handlers/    per-behavior handlers: (node, inbound flows, dt) -> (outbound flows, metrics)
  src/lessons/         lesson loader, lesson store + UI (also loads explainer files)
  src/explainers/      explainer player + UI
  src/compare/         compare view: two designs, scripted scenarios, results table
lessons/      lesson JSON files
explainers/   explainer JSON files (+ graphs/ for saved starting graphs)
docs/         SPEC.md and design notes
.mcp.json     registers the `sysdesign` MCP server (http://localhost:8000/mcp) for `claude`
```

## Frontend notes
- `docs/frontend-guide.md` explains the frontend for a backend engineer (tools, file map, data flow). Keep it current when the frontend changes.
- React Flow is v13: `onNodesChange` gets a changeset, apply with `changes.applyTo(nodes)` (`applyNodeChanges` is gone). Re-parent with `changeParent` from `useReactFlow()`.
- The saved-design format (`frontend/src/design.ts`) is ours, not React Flow's. Lessons, explainers and MCP read it.

## Rules
- Sandbox mode must work with no backend and no Claude, and build as a static site. Lessons, explainers and tutor are layers on top; sandbox never imports from them.
- KISS. Smallest thing that works. No abstractions until there are 3 users of them.
- Simulator code is pure TS (state in, state out). Unit test it with Vitest.
- One source of truth for the graph: the frontend store. Backend mirrors it over websocket so MCP tools can read and mutate it.
- Block types are data-driven via the registry. Adding a block must not require touching the simulator core.
- Every numeric default in a product preset needs a `sources` entry or a `notes` line saying it's an estimate. No unsourced precision.
- Verify library APIs against current docs before using them (React Flow, MCP SDK, ttyd flags change).
- If unsure about something, say so. Don't guess.

## Commands
- Backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- Frontend: `cd frontend && npm run dev` (http://localhost:5173). Build: `npm run build`. Lint: `npm run lint` (oxlint)
- Terminal: `ttyd -W -O -i lo0 -p 7681 -t fontSize=15 tmux new -A -s sysdesign claude` (run from repo root; `brew install ttyd tmux` first; tmux keeps Claude alive across page reloads; see `docs/terminal-ttyd.md`)
- Tests: `cd frontend && npm test`, `cd backend && uv run pytest`
- Single test: `npx vitest run src/sim/foo.test.ts` or `-t "test name"`; `uv run pytest tests/test_x.py::test_name`

## Working style
- Work phase by phase (see SPEC). Stop at the end of each phase, show how to run it, and wait.
- Commit at each working checkpoint with a short message.
