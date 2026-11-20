---
name: sysdesign-add-lesson
description: Author a new System Design Trainer lesson JSON with requirement variants, traffic profiles, success criteria, twists and a hint ladder.
---

# Write a System Design Trainer lesson

Use when creating or editing files in `lessons/`.

## Steps
1. Read the Lessons schema in `docs/SPEC.md` and one existing lesson file.
2. Choose mode:
   - `full`: blank canvas, user designs from requirements.
   - `targeted`: provide `starter_graph` with a specific flaw (e.g. no cache, single DB, sync call to LLM) and a symptom in `brief` ("p99 is 4s").
   - `compare`: same design, one block swapped between two products (see SPEC).
3. Write at least 2 variants of the same system that force different designs. Good pairs:
   - read-heavy vs write-heavy
   - strong vs eventual consistency
   - single region vs global low-latency
   - cheap vs fast (tight `max_cost_hr`)
4. For each variant set `traffic` and `success` so that:
   - a naive design (client -> service -> single DB) clearly fails
   - the intended design passes with some margin
   - over-provisioning fails the cost limit
   Sanity-check by reasoning through the sim model (μ, ρ, cache hit ratio) and note the math in a `_notes` field.
5. Add a `twist`: a mid-task change that invalidates part of a good design (traffic ×10, new consistency need, region outage).
6. Hint ladder of 3: a question, a direction, a near-answer. Never the full answer.
7. Validate the JSON loads (run the lesson loader test).

## Rules
- One concept per variant pair. Don't stack five lessons into one.
- Requirements are stated as numbers where possible (rps, p99, ratio, cost).
