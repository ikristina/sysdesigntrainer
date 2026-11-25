---
name: sysdesign-add-block
description: Add a new component block (DB, cache, queue, AI service, etc.) to the System Design Trainer app's block registry and simulator.
---

# Add a block to System Design Trainer

Use when adding or changing a block type in the System Design Trainer repo.

## Steps
1. Read `docs/SPEC.md` (Blocks + Simulator sections) and look at 1-2 existing files in `frontend/src/blocks/` to match the pattern.
2. Create `frontend/src/blocks/<type>.ts` with: `type`, `label`, `category`, `params` (name, default, min, max, unit), `simBehavior`, `cost` (USD per replica-hour). Copy the shape of an existing file and use the param helpers in `types.ts`.
3. Add it to the `blocks` list in `frontend/src/blocks/index.ts`.
4. Pick a `simBehavior`:
   - Reuse an existing handler if the block behaves like one (e.g. a new KV store can reuse `kv`).
   - Only add a new handler in `frontend/src/sim/handlers/` if behavior is genuinely different. Keep it pure: (node, inbound flows, dt) -> (outbound flows, metrics).
5. Pick realistic defaults. Order-of-magnitude is fine, but state the assumption in a comment (e.g. `// ~10k rps per Redis node, simple GETs`). If unsure of a real-world number, say so in the comment rather than inventing precision.
6. Add a Vitest test: block registers, params validate, and if a new handler was added, test ρ<1, ρ≥1 (queue grows), and killed (μ=0).
7. If the block should be visible to Claude via MCP, confirm `get_design` serializes its params (it should, if data-driven).

## Rules
- Do not touch the simulator core loop to add a block.
- KISS: fewest params that teach the trade-off. Add more only when a lesson needs them.
- Run `npm test` in `frontend/` before finishing.
