# System Design Trainer - Spec

## Goal
Learn system design by doing: build a design, load it, watch it fail, fix it. Same system under different requirements (read-heavy vs write-heavy, strong vs eventual consistency) teaches why designs differ. Claude coaches through an embedded terminal using the user's Pro/Max subscription (no API key).

## Modes
- **Sandbox** (default, no lesson): blank canvas, drag/drop, edit params, run traffic, chaos controls, save/load. Works fully offline with no backend and no Claude. Must be deployable as a static site.
- **Explainer**: step-through animated walkthrough of one concept (read-only canvas, Next/Back, captions). Ends with "Open in sandbox" so the user can play with the final state.
- **Lesson**: sandbox plus lesson panel, steps, success checks.
- **Tutor**: lesson or sandbox plus Claude over MCP.
Lessons and tutor are layers on top of sandbox. Sandbox never depends on them.

## Architecture
```
Browser
 ├─ Canvas (React Flow) ── store (Zustand) ── Simulator (TS, tick loop)
 ├─ Metrics / params / lesson panels
 └─ iframe → ttyd :7681 → `claude` (Claude Code)
                                │ MCP (streamable HTTP)
FastAPI :8000 ──────────────────┘
 ├─ /ws        websocket: frontend pushes graph+metrics, backend pushes commands
 ├─ /mcp       MCP server (FastMCP)
 └─ static     serves built frontend
```
Project `.mcp.json` registers the server so `claude` picks it up automatically:
```json
{ "mcpServers": { "sysdesign": { "type": "http", "url": "http://localhost:8000/mcp" } } }
```

## Blocks
Each block = registry entry: `type`, `label`, `icon`, `category`, `params` (with defaults, min/max), `simBehavior` (which sim handler), `cost` per replica-hour.

Initial set:
- Edge: client, DNS, CDN
- Traffic: load balancer, API gateway (rate limit param)
- Compute: service, worker, serverless function
- Data: SQL DB (primary + read replicas), NoSQL/KV, wide-column, graph DB, search index, vector DB, blob storage
- Cache: in-memory cache (hit ratio, TTL, eviction)
- Async: queue, stream (partitions, consumers)
- AI: LLM service (tokens/s, latency high, cost high), embedding service
- Grouping: region, availability zone (visual containers, affect latency between them)

Common params: replicas, capacity_rps per replica, base_latency_ms, timeout_ms, pool_size (where relevant).

### Shapes
Each block category has its own hand-drawn shape (rough.js), so a design reads at a glance:
- Client: monitor / phone
- CDN, region: cloud
- Load balancer, gateway: diamond
- Service, worker, function: rounded box (function has a lambda mark)
- Databases: cylinder (KV and wide-column get small variations)
- Blob storage: bucket
- Cache: box with a lightning mark
- Queue, stream: pipe (stream shows partition lanes)
- LLM / embeddings: chip with a sparkle
Each block shows a small utilization bar inside the shape.

### Product presets
A product block is a preset of a generic block: same sim handler, product-specific params, defaults and behavior flags, plus a logo. The generic block stays available.

| Generic | Presets |
|---|---|
| Cache | Redis, Memcached, Valkey |
| Queue / stream | Kafka, RabbitMQ, SQS, Kinesis |
| SQL | Postgres, MySQL, CockroachDB |
| NoSQL / KV | DynamoDB, Cassandra, MongoDB |
| Search | Elasticsearch / OpenSearch |
| Blob | S3 |
| CDN | CloudFront, Cloudflare |

Behavior flags model what makes the product different, e.g.:
- Redis: single-threaded command execution per node, persistence (none / RDB / AOF), replication, cluster mode
- Memcached: multi-threaded, no persistence, no replication (a node loss = cold keys)
- Kafka: partitions cap consumer parallelism, ordering per partition, retention, consumer lag
- SQS: no ordering (standard) vs FIFO throughput cap, visibility timeout, at-least-once
- DynamoDB: per-partition throughput limit, so hot keys throttle
- Postgres: single writer, connection limit, replica lag
- CockroachDB: multi-writer, consensus write latency, cross-region latency cost

Preset file shape (`frontend/src/blocks/presets/<product>.ts`):
```ts
{
  id: "redis", base: "cache", label: "Redis", logo: "redis",
  params: { capacity_rps: 100000, threads: 1, persistence: "none", ... },
  flags: { singleThreaded: true, replication: true },
  sources: { capacity_rps: "https://... (benchmark or docs link)" },
  notes: "Assumptions behind the defaults"
}
```
Every numeric default needs a `sources` entry or a `notes` line saying it's an estimate. No unsourced precision.

Logos: Simple Icons (SVGs are CC0, marks belong to their owners). Add a trademark note to the README.

## Simulator (queueing model, not real traffic)
Tick-based, 10 ticks/s sim time. Per node per tick:
- Service rate `μ = replicas × capacity_rps`. Arrival `λ` = sum of inbound flows.
- Utilization `ρ = λ/μ`.
- If `ρ < 1`: each replica is its own M/M/c queue with `c = round(μ_replica × base_latency)` servers, at least 1 (Little's law), each taking `s = c / μ_replica`: latency ≈ `base + ErlangC(c, cρ) · s / (c(1 - ρ))` (cap ρ at 0.99). Replicas behind a load balancer don't share one wait line.
- If `ρ ≥ 1`: queue grows by `(λ - μ)·dt`, wait = `queue/μ`. When wait > timeout, overflow becomes errors.
- Retries (client param) re-add a share of errors to λ, so failures can cascade. `retry_budget` caps retries at 10% / 20% of offered traffic; `backoff: exponential` spreads them with full jitter.
- Queues and streams are at least once: messages a consumer failed are redelivered (backlog grows instead of work being lost). On a queue, redeliveries count against `capacity_rps` before new sends.
- A fan-out edge can be `sequential`: N calls in turn (latency × N), like an agent loop.
- Request latency end-to-end = sum along the path. Track p50/p99 from a sampled distribution per node.

Behaviors:
- Load balancer / gateway: split evenly across downstream. Gateway drops above its rate limit.
- Cache: reads → `h·λ` served locally, `(1-h)·λ` forwarded. Writes pass through (write-through) or invalidate (param).
- SQL DB: writes → primary only, reads → spread across replicas. Replication lag grows with primary ρ and write rate. Connection pool caps concurrent requests.
- Queue/stream: accepts up to its ingest limit, depth grows if consumers < producers, consumers drain at their μ. Producer latency stays low (this is the lesson).
- Cross-region edges add fixed latency (e.g. 70 ms).
- Killed node: μ = 0. Partitioned region: edges across it drop.

Traffic profile (global controls): total rps, read/write ratio, payload size, hot-key skew, spike button (×N for T seconds).

Outputs per node: λ, μ, ρ, queue depth, latency, error rate. Global: p50, p99, error %, throughput, cost/hour.

## Visuals
- Edges animated with particles. Particle rate and speed ∝ throughput, color by health (green → amber → red), width by volume.
- Dropped/errored requests: red particles that fall off the edge.
- Utilization bar inside every node fills with ρ.
- Queues show depth as a growing stack of small boxes.
- Nodes pulse/shake when saturated (ρ ≥ 1), gray with a crack when killed.
- Style: hand-drawn (rough.js) as the default. Optional fake-isometric skin later. No 3D engine.

## Lessons
JSON in `lessons/`. Schema:
```json
{
  "id": "url-shortener",
  "title": "URL Shortener",
  "mode": "full | targeted",
  "brief": "short problem statement",
  "variants": [
    {
      "id": "read-heavy",
      "requirements": ["100:1 read/write", "p99 < 100ms", "10k rps peak"],
      "traffic": { "rps": 10000, "read_ratio": 0.99 },
      "success": { "p99_ms": 100, "error_pct": 0.1, "max_cost_hr": 50 },
      "twist": "optional mid-task requirement change Claude can apply"
    }
  ],
  "starter_graph": null,
  "hints": ["nudge 1", "nudge 2", "near-answer"],
  "steps": ["requirements", "estimation", "api_and_data_model", "design", "load_test", "twist", "postmortem"]
}
```
Initial lessons: URL shortener (read-heavy / write-heavy), news feed (fan-out on write vs read), chat (strong vs eventual), rate limiter (targeted), "p99 is 4s, fix it" (targeted with starter graph).

### Explainers
JSON in `explainers/`. Same canvas and simulator, scripted. Each step sets the scene and the sim runs live, so animations are real, not drawn.
```json
{
  "id": "caching-basics",
  "title": "Why a cache helps reads (and not writes)",
  "steps": [
    { "caption": "One server, one DB. 1k rps is fine.",
      "graph": "graphs/one-server.json", "traffic": { "rps": 1000, "read_ratio": 0.9 } },
    { "caption": "10k rps. The DB saturates first.",
      "traffic": { "rps": 10000 }, "highlight": ["db"] },
    { "caption": "Add a cache. 90% of reads never reach the DB.",
      "add": [{ "type": "cache", "id": "cache", "between": ["api", "db"] }], "highlight": ["cache"] },
    { "caption": "Now flip to write-heavy. The cache does nothing.",
      "traffic": { "read_ratio": 0.3 }, "highlight": ["db"] }
  ]
}
```
Step ops: `graph` (load), `add`, `remove`, `set_params`, `traffic`, `highlight`, `kill`, `spike`. Back replays from step 0 to keep state consistent.
Initial explainers: load balancing, caching (+ invalidation), replication and lag, sharding and hot keys, queues and backpressure, retries and retry storms, CAP / consistency, consistent hashing, rate limiting, CDN.
Explainers link to related lessons, and lessons link back ("Stuck? Watch the explainer").

### Trade-off lessons (mode: `compare`)
Same design, one block swapped between two products, same traffic. The point is seeing numbers side by side.
- Redis vs Memcached (session cache): multi-key ops, node failure, persistence on/off
- Kafka vs SQS (event pipeline): ordering, replay, consumer scaling, cost
- Postgres vs DynamoDB (user profiles): hot key, cross-table queries, scaling writes
- Postgres vs CockroachDB (multi-region): write latency vs availability on region loss

Lesson schema adds:
```json
{ "mode": "compare", "swap": { "node": "cache", "options": ["redis", "memcached"] },
  "scenarios": ["steady 50k rps", "hot key", "kill 1 node", "restart with persistence"] }
```

### Compare view
Two runs side by side (A/B), same traffic and scenario timeline. For each:
- Live canvas with animations
- Overlaid charts: p50/p99, throughput, error %, over time
- Table: peak throughput, p99, error %, recovery time after failure, cache hit ratio (after restart), memory per GB of data, cost/hr
- Winner highlighted per row, with no overall winner (it depends on requirements; the user writes the verdict, Claude challenges it)
Works for any two saved designs too, not just presets.

## MCP tools (backend, operate on mirrored state)
- `get_design()` → nodes, edges, params
- `get_metrics()` → latest per-node + global metrics
- `get_lesson()` → current lesson, variant, step, user's estimation notes
- `set_requirements(variant_id | custom)` → swap requirements live
- `set_traffic(rps, read_ratio, ...)`, `spike(multiplier, seconds)`
- `kill_node(id)`, `restore_node(id)`, `partition_region(id)`
- `highlight(node_ids, message)` → draws attention on canvas
- `advance_step()`, `give_hint(level)`

## Phases
1. **Canvas**: scaffold repo, block registry, drag-drop palette, connect edges, param panel, save/load designs to JSON (localStorage + export file). Hand-drawn style.
2. **Simulator**: tick engine with tests, traffic controls, metrics panel, animated edges, saturation visuals, kill node.
3. **Claude link**: FastAPI websocket mirror, MCP server with tools above, `.mcp.json`, ttyd iframe panel.
4. **Explainers + lessons**: explainer player (step ops on the live sim), first 3 explainers; lesson loader, step UI, estimation scratchpad, success checks, hint ladder, cost meter.
5. **Products + compare**: shapes, product presets with sourced defaults, logos, compare view, trade-off lessons.
6. **Polish**: isometric skin, more blocks, more lessons.

## Non-goals
- Real load generation or real infrastructure
- Multi-user, auth, deployment
- Perfect accuracy. The model should be directionally right and explainable.
