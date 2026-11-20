# System Design Trainer

A local web app for learning system design hands-on. You drag components (services, databases, caches, queues...) onto a canvas, connect them, run simulated load, and watch the design break. Then you fix it. Later phases add Claude as a coach in an embedded terminal, talking to the app over MCP.

**Status:** Phase 1 (canvas) is done. See `docs/SPEC.md` for the plan.

## What you need

| Tool | Version | Needed for | Install (macOS) |
|---|---|---|---|
| Node.js + npm | 22.12+ or 24 LTS | frontend (all phases) | `brew install node` or https://nodejs.org |
| uv | any recent | backend | `brew install uv` |
| Python | 3.12+ | backend (uv installs it if missing) | `uv python install 3.12` |
| ttyd | any recent | Claude terminal panel (Phase 3+) | `brew install ttyd` |
| Claude Code | latest | Claude coaching (Phase 3+), on a Pro/Max plan | https://claude.com/claude-code |
| Chrome / Firefox / Safari | recent | using the app | |

Check what you have:

```bash
node -v      # v22.12 or higher
npm -v
uv --version
```

The sandbox (the canvas) needs **only Node**. The backend, ttyd and Claude Code are for the tutor features that come in later phases.

## Setup (once)

```bash
git clone <this repo> && cd SDTutor

# frontend: download the JavaScript libraries into frontend/node_modules/
cd frontend && npm install && cd ..

# backend: create backend/.venv and install FastAPI etc.
cd backend && uv sync && cd ..
```

## Run

```bash
# frontend: http://localhost:5173 (reloads as you edit files)
cd frontend && npm run dev
```

Open http://localhost:5173.

- **Add blocks:** drag tiles from the left panel onto the canvas.
- **Connect:** drag from a block's right dot to another block's left dot.
- **Edit:** click a block and change its params on the right.
- **Delete:** press Backspace to delete what's selected.
- **Group:** drop blocks inside a Region or AZ to group them. Drag a block out to ungroup it.
- **Save:** your design autosaves in the browser. Use **Export JSON** and **Import JSON** to save it to or load it from a file.

Backend (optional for now; it only has a health check):

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
curl localhost:8000/health        # {"status":"ok"}
```

Claude terminal (Phase 3+; run from the repo root so `claude` picks up the project's MCP config):

```bash
ttyd -W -p 7681 claude
```

## Test, lint, build

```bash
cd frontend
npm test                                  # all unit tests (Vitest)
npx vitest run src/design.test.ts         # one file
npx vitest run -t "round-trips"           # tests whose name matches
npm run lint                              # oxlint
npm run build                             # type-check + static build into frontend/dist/

cd ../backend && uv run pytest            # backend tests (none yet; arrive in Phase 3)
```

`npm run build` produces a static site in `frontend/dist/`. You can serve it from any static host (try it locally with `npm run preview`). Sandbox mode doesn't need the backend.

## Project layout

```
frontend/   React + TypeScript app (canvas, block registry, panels)
backend/    FastAPI app (Phase 3: websocket mirror + MCP server)
docs/       SPEC.md (full spec), frontend-guide.md, mockups/
lessons/    lesson JSON (Phase 4)
```

New to frontend? `docs/frontend-guide.md` explains every tool, file and data flow in this project.

## Troubleshooting

- **`npm run dev` says port 5173 is in use:** another dev server is running. Stop it, or run `npm run dev -- --port 5174`.
- **Canvas is in a weird state:** in Chrome DevTools (Cmd+Option+I), go to Application → Local Storage → `http://localhost:5173`, delete `sysdesign.design`, and reload.
- **`npm install` fails or warns about the engine:** check `node -v` is 22.12 or higher.
