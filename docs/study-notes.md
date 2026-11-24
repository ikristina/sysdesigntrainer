# Study notes

Things worth remembering from lessons. The app shows them under 📓 Notes, grouped by category.

Format: one `## Title` per note, then a `lesson:` line (lesson ids, comma-separated) and a
`category:` line, then the note in markdown (paragraphs, `-` lists, `|` tables, **bold**, `code`).

## 301 vs 302 redirects
lesson: url-shortener
category: HTTP

In both cases the browser gets the long URL in the `Location` header and goes there.
The difference is whether the browser **remembers** the redirect.

| | 301 permanent | 302 temporary |
|---|---|---|
| Browser caches the redirect | Yes, repeat clicks never reach you | No, every click hits your service |
| Click analytics | Lost after the first click | Every click counted |
| Expiry, editing, blocking a bad link | Doesn't reach browsers that cached it | Works right away |
| Load on you | Lower | All of it |

Pick 302 when you need analytics, expiry or the ability to kill a link. The cost: you serve
every redirect yourself, so that read load drives the design (cache in front of the store).
Pick 301 when the mapping never changes and you only care about offloading traffic.

## URL shortener: requirements checklist
lesson: url-shortener
category: Requirements

Easy to forget beyond rps and latency:
- Durability: losing a mapping is never OK.
- Read-after-write: a link has to work right after it's created.
- Custom aliases, and collisions between them.
- Same long URL twice: same code or a new one?
- Click analytics (decides 301 vs 302).
- Expiry, and rate limits on creation.

## Capacity cheat sheet: what one box handles
lesson: url-shortener
category: Estimation

Your number ÷ one box's capacity = boxes needed. Above 1, that number shapes the design.
Real-world values are rough orders of magnitude; the sim's are its block defaults.

| Box | Real world (rough) | Sim default |
|---|---|---|
| App server, simple handler | ~1k rps | 1,000 rps per replica |
| SQL primary, indexed lookups | ~5–10k qps | 5,000 |
| Cache node (Redis/Memcached) | ~100k ops/s | 50,000 |
| NoSQL/KV node | ~10k ops/s | 10,000 per replica |
| Load balancer | 50k+ rps | 50,000 |
| One DB server's disk | a few TB fine; 10+ TB → shard | n/a |
| Network card | 10 Gbit ≈ 1 GB/s | n/a |

Estimation recipe: split peak into reads/writes → peak ≈ 2–3× average → ×100k s/day →
storage = writes/day × bytes/row × days → bandwidth = reads/s × response size.
Watch units: 5,000,000 bytes/s is 5 MB/s, not 5,000 MB/s.

**Don't size to 100%.** Waits explode near full. How early depends on how many requests a box
works on at once. With **one worker**, wait grows as ρ / (1 − ρ):

| ρ (utilization) | Wait, one worker, relative to ρ = 0.5 |
|---|---|
| 0.5 | 1× |
| 0.7 | ~2.3× |
| 0.8 | 4× |
| 0.9 | 9× |
| 0.95 | 19× |
| 1.0 | grows without limit |

A box with **many workers** (an app server running ~20 requests at once) barely waits until
ρ ≈ 0.8, then climbs fast: ~1 ms at 0.8, ~5 ms at 0.9, ~15 ms at 0.95, unbounded at 1.0 (20 ms
requests). See the M/M/c note.

Size for ρ ≈ 0.6–0.7 at peak: replicas = peak ÷ (per-replica capacity × 0.6). That headroom
also covers a dead replica or a short spike. Example: 10k rps at 1k per replica is 10 at
ρ = 1.0 (backs up) and 11 at ρ = 0.9 (no room for a spike); you need ~16. In the sim, 10 replicas
give a p99 of ~500 ms, 11 give ~57 ms, and 14 or 16 give ~31 ms. Each replica runs ~20 requests at
once, so latency stays flat until it's nearly full and then jumps: the headroom is for spikes and a
dead replica, not for steady-state p99.

## Click counts: write-through vs write-behind
lesson: url-shortener
category: Caching

Per-link click counts don't belong in a metrics system (Prometheus behind Grafana). One series
per short code is billions of series, and metrics stores die on that cardinality. Use metrics
for totals like redirects/s.

Count in Redis: `INCR clicks:{code}`, fired without waiting so it never slows the redirect.
It's atomic, and one node does ~100k ops/s, so even a 50k clicks/s celebrity link fits.

| | Write-through | Write-behind |
|---|---|---|
| How | Every click writes Redis, then the DB | Redis counts; every ~30 s a job adds each link's delta to the DB |
| DB writes for 50k clicks/s on one link | 50k/s on **one row**, all waiting on its lock | 1 per flush |
| Lost on a Redis crash | Nothing | Up to one flush interval |
| Use for | Data you can't lose (the mappings) | Counters, analytics |

Write-through here would take down the DB: a SQL primary handles ~5k writes/s in total.

"Count clicks" doesn't mean "count every click exactly". Losing ~30 s on a rare crash is well
under 0.01% a month. Mappings and clicks need different durability, so they get different storage.

If counts must be exact:
- Redis persistence (AOF, `fsync everysec`): a crash loses at most ~1 s. Cheap, often enough.
- Click events to a durable stream (Kafka), with a consumer that adds them up and writes totals in batches. Nothing lost, but it's at-least-once, so it needs dedup, plus a stream to run.

Short answer: "approximate with write-behind, and here's how I'd make it exact."

## Spikes on a hot link: CDN, not a queue
lesson: url-shortener
category: Scaling

A celebrity link: 30k clicks/s on **one** short code, against a service sized for 16k/s.
Sizing for the spike (~50 replicas) breaks the budget and sits idle the rest of the time.

**A queue doesn't help.** A redirect is synchronous: the browser is waiting for the 302.
Queued requests wait past the client's timeout and fail anyway, just later.

| Work | Someone waiting? | Queue helps? |
|---|---|---|
| Redirect `GET /{code}` | Yes, the browser | No |
| Bulk `POST /shorten` | Can be async | Yes |
| Click events | No | Yes |

**A separate replica doesn't help either.** It still sits behind the service, and the
service is what runs out.

**Cache the 302 at a CDN.** Everyone clicking that link gets the exact same answer, so one
remembered answer serves them all.
- The service sends the 302 with `Cache-Control: max-age=60`.
- The first click goes CDN → service. The CDN keeps the answer and serves the next clicks itself.
- After 60 s the CDN asks once more. The service sees about 1 request a minute per edge location.
- It's the 301 idea made safe: the CDN remembers the redirect for 60 s, not the browser forever.

| You give up | Fix |
|---|---|
| The service doesn't see every click | Count clicks from CDN access logs |
| A deleted or expired link works for up to 60 s | Short max-age, or purge the CDN entry on delete |

## Autoscaling: the minimum survives bursts, the maximum handles growth
lesson: url-shortener
category: Scaling

New instances take ~1–3 minutes to detect load, boot and warm up. A 60 s spike can be over
before they arrive. Autoscaling handles slow curves (day vs night, growth), not sudden bursts.

Set the **minimum** so the floor survives a burst on its own, and the **maximum** for slow growth.

The floor also has to cover the cache missing: a CDN purge, deploy or outage sends all traffic
straight to the service, and long-tail links miss more than hot ones.

Example (URL shortener with a CDN at 90% hits): the service sees ~1.1k rps at peak.

| Replicas | Steady 1.1k rps | ×3 spike, 3.3k rps |
|---|---|---|
| 2 | ρ 0.55, fine | ρ ≈ 1.6, down |
| 4 | ρ 0.27, fine | ρ ≈ 0.8, survives |

**How to size the floor.** Two utilization targets:
- Steady state: aim for ρ ≈ 0.6, so waits stay short all day.
- Short burst: accept up to ρ ≈ **0.85** (where gauges turn amber). For a replica running ~20 requests at once, queue wait is still only ~2.5 ms on top of 20 ms requests: slower and climbing, but bounded, and fine for 60 s. Above 1.0 the queue grows without limit.

So during a burst one replica can usefully serve 1,000 rps × 0.85 = **850 rps**.

Floor = burst rps reaching the service ÷ 850 = 3,300 ÷ 850 ≈ 3.9 → **4 replicas**.
Here 3,300 is the ×3 spike after the CDN's 90% hits. Autoscale 4 → 16.
Result (LB, cache 0.9, one SQL behind the service): 4 replicas + CDN give p99 ~50 ms at $1.18/hr,
and ~52 ms through the ×3 spike (ρ 0.82). 16 replicas with no CDN give ~31 ms at $2.28/hr.

## ρ (rho): utilization
lesson: url-shortener
category: Estimation

ρ is how busy a block is: **ρ = requests coming in ÷ requests it can handle.**

| ρ | Meaning | Gauge |
|---|---|---|
| 0.5 | Half busy, short waits | Green |
| 0.6–0.7 | Target for steady-state sizing | Green |
| 0.85–1.0 | Nearly full, waits growing fast. OK only for a short burst | Amber |
| ≥ 1.0 | More arriving than it can serve: the queue grows and requests drop | Coral |

Example: 10,000 rps into 2 service replicas of 1,000 rps each → ρ = 10,000 ÷ 2,000 = 5.

It's the number under each block's gauge. Wait time explodes as ρ nears 1.0 (how early depends on workers per box): see the capacity
cheat sheet. In the URL shortener (4 replicas + CDN), going from 10k to 40k rps put the service at ρ 1.10 and p99 went from ~50 ms to ~3 s.

## M/M/c in plain words: the coffee shop
lesson: url-shortener
category: Estimation

M/M/c is the maths of **one waiting line served by c workers**. The letters only say that:

| Letter | Meaning |
|---|---|
| **M** (1st) | People arrive at random times |
| **M** (2nd) | Each job takes a random amount of time |
| **c** | How many workers share the line |

Example: a drink takes **2 minutes**, and the baristas are busy **90%** of the time.
Shop A has 1 barista. Shop B has 10 baristas, one shared line, and 10× the customers.
Average time standing in line before someone starts your drink:

| How busy (ρ) | Shop A: 1 barista | Shop B: 10 baristas |
|---|---|---|
| 50% | 2 min | ~0 min |
| 80% | 8 min | 0.4 min |
| 90% | **18 min** | **1.3 min** |
| 95% | 38 min | 3.3 min |

Equally busy, but Shop B's wait is ~14× shorter at 90%. In Shop A you wait whenever the one
barista is busy. In Shop B you wait only if **all ten** are busy at the same moment, and with
random arrivals one is usually free.

What it affects:
- **How latency grows with load.** Many workers: waits stay near zero, then shoot up close to 100%. One worker: waits grow steadily from the start.
- **How many servers you need.** Big pooled systems can safely run hotter (85–90%) than small ones.
- **One shared line beats separate lines.** 10 baristas with 10 separate lines behave like 10 Shop A's: you're stuck behind a slow order while the next barista is idle. That's why a load balancer that picks a free server beats random assignment.
- **100% is never OK.** At 100% the line grows forever in either shop.

In the app, each service replica is a shop with ~20 workers (1,000 rps × 20 ms). 11 replicas at
90% busy give p99 ~57 ms; 10 at 100% give ~500 ms and keep backing up.

One sentence to tell someone: "More workers sharing one line keeps waits tiny until you're
nearly full, then they explode, so leave headroom."

## M/M/c: how the wait is calculated
lesson: url-shortener
category: Estimation

Three inputs:
- **λ** (lambda): arrivals per minute. Example: 0.8 customers/min.
- **s**: time per job. Example: 2 min per drink.
- **c**: workers. Example: 2 baristas.

**Step 1, load:** `a = λ × s` = 0.8 × 2 = **1.6**. On average there's 1.6 baristas' worth of work.

**Step 2, utilization:** `ρ = a ÷ c` = 1.6 ÷ 2 = **0.8**. Each barista is busy 80% of the time.
It must be below 1, or the line grows forever and none of this applies.

**Step 3, chance you have to wait (Erlang C).** You wait only if all c workers are busy.

| Part | Formula | Example (c = 2) |
|---|---|---|
| "Someone is free" weight | `1 + a + a²/2! + …` up to `a^(c−1)/(c−1)!` | 1 + 1.6 = 2.6 |
| "All busy" weight | `a^c / c! × 1 / (1 − ρ)` | 1.6² / 2 × 1 / 0.2 = 1.28 × 5 = 6.4 |
| Chance you wait | all busy ÷ (free + all busy) | 6.4 ÷ (2.6 + 6.4) = **0.71** |

So 71% of customers wait at all.

**Step 4, average wait:** `W = chance you wait × s ÷ (c × (1 − ρ))`.
- `s ÷ c` = how often a barista frees up: every 2 ÷ 2 = 1 min.
- `1 ÷ (1 − ρ)` = how many of those you wait through if you're stuck: 1 ÷ 0.2 = 5.
- So if you wait, it's ~1 × 5 = 5 min. Only 71% wait: W = 0.71 × 5 = **3.6 min**.

**Step 5, total time:** `s + W` = 2 + 3.6 = **5.6 min** from arriving to getting your drink.

Check with **one** barista at the same 80% (λ = 0.4/min): a = 0.8, all busy = 0.8 × 5 = 4,
free = 1, chance = 4 ÷ 5 = 0.8 (with one worker it's always ρ). W = 0.8 × 2 ÷ (1 × 0.2) = **8 min**.
That's the old `ρ / (1 − ρ) × s` rule: 4 × 2 = 8. Two baristas at the same busyness: 3.6 min.

**How the sim does it** (`latencyOf` and `erlangC` in `frontend/src/sim/handlers/common.ts`):
- c = capacity per replica × base latency: 1,000 rps × 0.020 s = **20** workers.
- s = c ÷ capacity = 20 ms (the base latency).
- ρ = incoming rps ÷ capacity, capped at 0.99. At ρ ≥ 1 a separate overflow backlog adds its own wait instead.
- Latency = base + W + backlog wait.
- Each load-balanced replica has its own line of 20 workers. Replicas don't share one line.

Same 20 ms requests, 20 workers vs 1:

| ρ | Chance of waiting (c = 20) | W, 20 workers | W, 1 worker |
|---|---|---|---|
| 0.5 | 0.4% | 0.01 ms | 20 ms |
| 0.7 | 9% | 0.3 ms | 47 ms |
| 0.8 | 26% | 1.3 ms | 80 ms |
| 0.9 | 55% | 5.5 ms | 180 ms |
| 0.95 | 76% | 15 ms | 380 ms |

Example row ρ 0.9: W = 0.55 × 20 ÷ (20 × 0.1) = 0.55 × 10 = 5.5 ms. Nobody does the c = 20 sums by
hand; the code loops over them.

## How Claude's MCP tools are scoped
lesson:
category: This app

All tools live in `backend/app/tools.py`, in three groups. Each refuses unless the right screen is open:

| Group | Tools | Refuses when |
|---|---|---|
| Design + load | `get_design`, `get_metrics`, `run`, `set_traffic`, `spike`, `kill_node`, `restore_node`, `partition_region`, `highlight` | The app isn't open |
| Lesson | `get_lesson`, `set_requirements`, `advance_step`, `give_hint` | No lesson is open |
| Compare | `get_compare`, `run_scenario` | The compare view isn't open |

- **Read tools** return the last snapshot the browser sent (about once a second).
- **Write tools** change nothing themselves. They send `{op, args}` to the browser, which applies it to its own state.
- **Left out on purpose:** no `add_node`, `connect` or `set_param`. Claude can change load, break things and hint, but can't edit your design. You do the designing.
- **Local only:** `/ws` accepts only localhost pages (Origin check), `/mcp` has the MCP SDK's DNS-rebinding protection, ttyd listens on loopback only (`-i lo0`).

## Why Claude talks to the app through a backend mirror
lesson:
category: This app

- **They can't connect directly.** Claude Code only talks to MCP servers (stdio or HTTP) and can't reach into a browser tab. A browser tab can't accept incoming connections, only open them. So a server sits in the middle: the browser opens a websocket to it (`/ws`), Claude connects to it (`/mcp`).
- **The browser stays the source of truth.** The simulator runs in the browser because sandbox mode must work offline as a static site with no backend. So the backend is a thin relay: it keeps the latest snapshot and forwards commands, and never simulates. If it owned state too, there would be two copies that could disagree.
- **The cost:** metrics Claude sees can be ~1 s old, tools fail if the app isn't open, and with two tabs the last one to report wins (marked `ponytail:` in `send()`).
- **The alternative was worse:** driving the page with browser automation means screenshots and clicks, which is slow and brittle.

## Which design decisions were mine vs the agent's
lesson:
category: This app

An honest read, not provable. From my SPEC and CLAUDE.md, choices the agent probably wouldn't have made unprompted:
- **Claude Code in an embedded terminal on my Pro/Max subscription.** The agent's default would likely be a chat panel calling the API with a key: paid per message, no Claude Code tools.
- **Simulator in the browser; sandbox never depends on the backend.** The agent would likely have put the sim in Python next to the MCP server (easier wiring), and the app would stop working without a backend.
- **Every preset number needs a source or an "estimate" note.** Otherwise: plausible-looking made-up numbers.
- **Check library docs, not memory.** Caught React Flow v13's API changes (`applyNodeChanges` is gone).
- **Phase by phase, stop after each.** Otherwise the agent builds further ahead before I can steer.

Corrections I made along the way:
- "add some lessons for testing, why did you skip?": the agent had deferred lessons I needed to try the app.
- "the only difference is the cost": I noticed compare lessons didn't teach anything visible, which led to the UX fixes.
- Study notes tagged by lesson and category: my feature idea.
- Valkey vs Redis, the redesign from my mockups, the GitHub noreply email.
- "fix incorrect info always": before that, the agent offered corrections as optional follow-ups.

The agent's choices: how the tools are scoped (the SPEC listed them), the "Claude can't edit your design" boundary, the 1 s snapshot rate, and the security checks.

## Unique ID generator (Snowflake IDs)
lesson:
category: Design topics

The problem: many servers create IDs at once, with no central counter. You want IDs that are unique,
fit in 64 bits, and roughly sort by creation time (good for indexes and "newest first").

Twitter's Snowflake (2010) packs a 64-bit integer:

| Bits | Holds | Why |
|---|---|---|
| 1 | sign bit, always 0 | Keeps the number positive |
| 41 | milliseconds since a custom epoch | ~69 years of IDs; sorting by ID ≈ sorting by time |
| 10 | machine id (Twitter split it 5 datacenter + 5 worker) | Up to 1,024 generators, no coordination |
| 12 | sequence within the same millisecond | 4,096 IDs per ms per machine |

- Each machine needs a unique machine id, handed out once (config, or a coordination service like ZooKeeper).
- **Clock going backwards** (NTP adjustment) could repeat IDs: the generator refuses or waits until its clock passes the last timestamp it used.
- IDs sort by time only roughly: two machines' clocks differ by a few ms.

Alternatives:

| Option | Good | Bad |
|---|---|---|
| UUID v4 (128 bits, random) | No coordination at all | Not sortable; random inserts scatter across a B-tree index |
| UUID v7 (RFC 9562, 2024) | Starts with a ms timestamp, so sortable; no machine ids | 128 bits, twice the size |
| Database auto-increment | Simple, strictly ordered | One database is a bottleneck and single point of failure |
| Ticket servers (Flickr) | Two DBs, one hands out odd IDs, the other even | Still a central service; order is only rough across the two |

## Collaborative editing (Google Docs): OT vs CRDT
lesson:
category: Design topics

The hard part isn't storage, it's two people typing in the same place at the same time. Both
edits arrive "at position 5", but after the first one is applied, position 5 means something else.

**Operational transformation (OT).** A server orders every edit for a document. When an edit was
made against an older version, the server **transforms** it (shifts its position) past the edits
it missed, then applies and broadcasts it. Google Docs uses OT. It works best with one central
server per document, which is why each open document is handled by one server at a time.

**CRDT (conflict-free replicated data type).** Every character gets a unique, ordered id instead of a
position. Edits refer to ids, and merging is designed so applying them in any order gives the same
result. No central ordering needed, so it suits offline and peer-to-peer editing. Libraries: e.g.
Yjs, Automerge. The cost: extra metadata per character, and deleted characters linger as
"tombstones" until cleaned up.

| | OT | CRDT |
|---|---|---|
| Needs a central server to order edits | Yes, in practice | No |
| Offline editing, merge later | Hard | Natural |
| Overhead | Small operations | Ids and tombstones per character |

The rest of the design:
- Clients keep a WebSocket to the document's server; edits and cursor positions flow over it.
- Store an **operation log** plus periodic **snapshots**: load = latest snapshot + the operations after it. The log also gives version history.
- Cursors and "who's here" (presence) are ephemeral: keep them in memory, never in the database.

## Stock exchange: the matching engine
lesson:
category: Design topics

The core is an **order book** per stock: resting buy orders sorted high to low, sell orders sorted
low to high. A new order that crosses the best price on the other side trades; the rest waits in
the book.

**Price-time priority:** the best price trades first; at the same price, the order that arrived
first trades first. That's why order of arrival must be exact and the same everywhere.

How exchanges get speed and correctness at the same time:
- **One thread per symbol (or group of symbols), all in memory.** No locks and no database on the hot path. LMAX, a retail exchange, reported about 6 million orders per second on a single thread with this approach (Martin Fowler, "The LMAX Architecture", 2011).
- **A sequencer** stamps every incoming order with a sequence number before matching, so the order is fixed and nothing races.
- **Event log (journal):** every input is written to a durable log. The engine is deterministic, so replaying the log rebuilds the exact book after a crash. A hot standby replays the same log live and can take over.
- **Risk checks** (enough money, position limits) happen before an order reaches the engine.
- **Market data** (trades, book updates) fans out to many subscribers; inside the data centre this is often UDP multicast.

Common trap: putting the order book in a database with row locks. The exact ordering and
microsecond latency come from the single-threaded in-memory engine plus the log, not from the database.

## Proximity search (Yelp): geohash and quadtree
lesson: driver-locations
category: Design topics

"Find restaurants within 1 km" can't use a normal index: latitude and longitude are two separate
numbers, and an index on each still scans a whole strip of the map. The fix is to turn 2D positions
into cells you can look up.

**Geohash:** interleave the bits of latitude and longitude and write them in base32. Points that
share a longer prefix are usually close together. Cell size by length:

| Geohash length | Cell size (roughly, at the equator) |
|---|---|
| 5 | 4.9 km × 4.9 km |
| 6 | 1.2 km × 0.6 km |
| 7 | 153 m × 153 m |

- To search a radius: pick the length whose cell covers it, take the user's cell **plus its 8 neighbours** (a place across a cell border can have a different prefix), then filter by real distance.
- Easy to store: a plain indexed string column, or Redis GEO commands (they store a geohash as the sorted-set score).

**Quadtree:** split the map into 4 squares, and keep splitting any square with too many places
(e.g. more than 100). Dense cities get small cells, empty areas stay big. Usually built in memory
and rebuilt periodically.

Other options: Google S2 (cells along a space-filling curve) and Uber H3 (hexagons).

**Businesses vs drivers:**
- Businesses rarely move, so precompute the index and cache search results hard.
- Drivers move every few seconds, so their positions live in memory and get overwritten (see the driver locations lesson).
