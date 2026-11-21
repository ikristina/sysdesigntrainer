# System Design Trainer

A local web app for learning system design hands-on. You drag components (services, databases, caches, queues...) onto a canvas, connect them, run simulated load, and watch the design break. Then you fix it. Claude coaches you from a terminal under the canvas and talks to the app over MCP.

**Status:** Phases 1 (canvas), 2 (simulator), 3 (Claude link), 4 (lessons and explainers) and 5 (product presets and compare) are done. See `docs/SPEC.md` for the plan.

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

The sandbox (the canvas and simulator) needs **only Node**. The backend, ttyd and Claude Code are for Claude coaching.

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
- **Simulate:** add a **Client**, connect it to your design, and press **▶ Run**. Set load with the **Traffic** and **Read / write** sliders in the header; **More ▾** holds the hot-key share, payload size and followers / following (for feeds). Click a connection to set what it **carries** (reads only, writes only) and whether it **fans out** (each write × followers, or each read × following). **⚡ Spike** triples traffic for 10 s. **✕ Kill** takes down the selected block (or a whole region). **⇹ Partition** (region selected) cuts the network at that region's border. **Reset** clears queues and the chart.
- **Lessons and explainers:** pick one from the menu at the top left. An **explainer** is a short guided tour: press **Next →** and watch the live sim change. A **lesson** gives you requirements, walks you through steps (notes box per step), and checks your design: press **▶ Run load test** and keep every success check green for 10 s. **Show hint** reveals hints one at a time. Your sandbox design is kept separately and comes back when you pick **Sandbox** or click the logo.
- **Products:** the palette's product tiles (Redis, Kafka, Postgres, DynamoDB...) are generic blocks with that product's defaults, logo and price. Click one to see its facts and sources.
- **Compare:** pick a compare lesson (or **Two saved designs**) under *Compare* in the menu. Choose a scenario, a speed, and press **▶ Run both**. Both designs run the same scripted timeline; the table on the right shows who wins each metric. Write your verdict on the left.
- **Read the results:** blocks turn amber near capacity and red (shaking) when saturated. Edges show flow, and red dots fall off where requests fail. The right panel shows p50/p99, errors, throughput, cost and the most saturated blocks. How the model works: `docs/frontend-guide.md`, section 7.

### With Claude

Three terminals, plus the frontend above:

```bash
# 1. backend: mirrors the app's state and serves Claude's MCP tools on :8000
cd backend && uv run uvicorn app.main:app --reload --port 8000

# 2. Claude terminal, from the repo root (that's where claude finds .mcp.json)
ttyd -W -O -i lo0 -p 7681 claude
```

3. Open (or reload) http://localhost:5173. The terminal panel opens under the canvas by itself once ttyd is running. The violet **✦ Ask Claude** button in the header shows or hides it.
4. The first time, Claude Code asks whether to use the project's `sysdesign` MCP server. Approve it.
5. Check the panel's status line says `connected to sysdesign MCP`. Then ask Claude something like "look at my design and load test it at 5k rps".

What Claude can do: read the design and live metrics, start or pause the sim, set traffic, spike, kill or restore blocks, partition a region, and highlight blocks with a note. In a lesson it also reads your notes and progress, changes the requirements (the twist), moves to the next step and gives hints. In a compare it reads the results table and your verdict, and runs scenarios. How it works: `docs/frontend-guide.md`, section 8. What ttyd is, its flags and why each matters: `docs/terminal-ttyd.md`.

## Test, lint, build

```bash
cd frontend
npm test                                  # all unit tests (Vitest)
npx vitest run src/design.test.ts         # one file
npx vitest run -t "round-trips"           # tests whose name matches
npm run lint                              # oxlint
npm run build                             # type-check + static build into frontend/dist/

cd ../backend && uv run pytest            # backend tests (websocket mirror + MCP tools)
```

`npm run build` produces a static site in `frontend/dist/`. You can serve it from any static host (try it locally with `npm run preview`). Sandbox mode doesn't need the backend.

## Project layout

```
frontend/   React + TypeScript app (canvas, block registry + product presets, simulator, panels, compare view)
backend/    FastAPI app: websocket mirror (/ws) + MCP server (/mcp) for Claude
.mcp.json   tells Claude Code where the MCP server is
docs/       SPEC.md (full spec), frontend-guide.md, terminal-ttyd.md, mockups/
lessons/    lesson JSON (including compare lessons)
explainers/ explainer JSON (+ graphs/: starting designs)
```

New to frontend? `docs/frontend-guide.md` explains every tool, file and data flow in this project.

## Troubleshooting

- **`npm run dev` says port 5173 is in use:** another dev server is running. Stop it, or run `npm run dev -- --port 5174`.
- **Canvas is in a weird state:** in Chrome DevTools (Cmd+Option+I), go to Application → Local Storage → `http://localhost:5173`, delete `sysdesign.design`, and reload.
- **`npm install` fails or warns about the engine:** check `node -v` is 22.12 or higher.
- **Claude says the app isn't open, or the status line says "backend not running":** start the backend (step 1), then wait 3 s. The app reconnects by itself.
- **Claude has no `sysdesign` tools:** run `claude mcp list` from the repo root. "Pending approval" means you should restart `claude` and approve it. "Failed" means the backend isn't running.

## Product logos and prices

- **Logos** come from [Simple Icons](https://simpleicons.org) (the `simple-icons` npm package). The package is CC0, but some icons carry their own license (Kafka and Cassandra are Apache-2.0). All marks belong to their owners. The app uses them only to label a block with the product it stands for, and that use doesn't imply any endorsement. Simple Icons has no AWS, Memcached or Valkey icons, so those blocks show their initials (Mc, VK, DDB, SQS, S3...) in a dashed circle.
- **Prices and limits** in the product presets come from public docs and price lists (AWS us-east-1 on-demand, read 2026-11-20). Each block lists its sources under *Sources and estimates*. Numbers without a source are marked as estimates. Prices change, so don't use these to budget a real system.
