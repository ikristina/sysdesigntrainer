# Kickoff prompt

Setup first:
1. Make a repo folder, drop `CLAUDE.md` in the root and `SPEC.md` in `docs/`.
2. `cd` into it, `git init`, run `claude`.
3. Paste the prompt below.

---

Read CLAUDE.md and docs/SPEC.md. We're building Phase 1 only.

Before writing code:
- Confirm the current APIs for @xyflow/react, rough.js and Vite's React-TS template (check docs, don't rely on memory).
- Give me a short plan: folder structure, block registry shape, store shape, and the saved-design JSON format. Keep it to one screen. Wait for my OK.

Then build Phase 1:
- Scaffold frontend (Vite + React + TS) and an empty backend (FastAPI with a health route, uv project).
- Block registry with the full initial block list from the spec (params + defaults + cost, simBehavior can be a stub string for now).
- Left palette grouped by category, drag onto canvas.
- Connect blocks with edges. Basic static edge style for now.
- Right panel: edit params of the selected node, with min/max validation.
- Region/AZ as group containers that nodes can sit inside.
- Hand-drawn look with rough.js for nodes and edges.
- Save/load: autosave to localStorage, export/import JSON file.
- Vitest set up with a test for the registry and save/load round-trip.

When done: commit, tell me exactly how to run it, list anything you stubbed or skipped, and stop.
