# Learnings: building an interactive system design trainer

A running log of what matters when building this app: a browser simulator, a React Flow canvas, and Claude coaching over MCP. Add to it every session. Anything under "Gotchas hit" happened in this repo.

System design *content* (estimates, trade-offs, real-world designs) goes in `docs/study-notes.md`, not here. This file is about building the tool.

---

## 1. Mental model

- **The frontend store is the only source of truth for the graph.** The backend mirrors it over a websocket so MCP tools can read and change it. The backend never simulates.
- **Claude acts on the app through MCP (`:8000/mcp`), not through the terminal.** The ttyd terminal is only for the user to talk to Claude. `claude` has to start in the repo root so it finds `.mcp.json`.
- **Sandbox is the base layer.** Lessons, explainers and the tutor sit on top of it, and sandbox never imports from them, so it still builds as a static site with no backend and no Claude.

## 2. Gotchas hit

- **MCP Python SDK 2.x uses `MCPServer` (`from mcp.server import MCPServer`), not `FastMCP`.** Most tutorials still show v1. (2026-11-25)
- **React Flow v13 removed `applyNodeChanges`.** `onNodesChange` gets a changeset that you apply with `changes.applyTo(nodes)`, and you re-parent with `changeParent` from `useReactFlow()`. (2026-11-25)
- **Brave's ad-blocker blocked `explainers/graphs/clickstream.json`** because of the word in the URL. The graphs are loaded with an eager `import.meta.glob`, so one blocked file white-screened the whole dev server. The fix was renaming it to `click-events.json`. Keep tracking words like click, ad, analytics and pixel out of file names that load in dev. (2026-11-25)
- **Changing the queue model broke lessons that had nothing to do with queues.** Moving to per-replica M/M/c changed p99, error and cost figures in 17 lesson and compare notes, and three lessons stopped passing. When you change the sim, rerun the lesson tests and recheck the numbers in lesson notes. (2026-11-22)
- **A pass window one replica count wide is fragile.** A small sim change pushes the only passing design out of it. Lesson budgets now pass at 2 or more replica counts. (2026-11-22)
- **Failures from a dead target aren't independent tries.** Retrying a dead primary fails every time, while an overload failure can succeed on retry. Treating both the same way gave the wrong error % under `kill_primary`. (2026-11-24)
- **ttyd starts a new process per connection,** so every page reload killed Claude. Running `claude` inside `tmux new -A` keeps the session alive. (2026-11-24)
- **Not every twist can be modelled.** The tutor checks each twist against what the sim can actually do and logs any mismatch in `docs/sim-gaps.md` instead of acting it out wrongly. (2026-11-24)

## 3. Workflow that works

- Fact-check lesson and study-note numbers against primary sources, and keep `References` next to them. Several "well known" figures were wrong (s-maxage, 301 caching, CloudFront price).
- Every preset default has a `sources` entry or an estimate note.
- Saved source articles (PDFs) and `quizzes/weak-spots.json` stay local because the repo is public.
