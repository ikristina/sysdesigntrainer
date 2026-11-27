# Changelog

What's new in System Design Trainer, newest first. Full detail: `git log`.

## 2026-11-27

- **Split traffic at a gateway or load balancer.** Click a connection out of one and set **Share %**: e.g. API 10, Kafka (writes only) 90 sends every read and 10% of writes to the API, 90% of writes to Kafka. Connections without a share split what's left evenly.
- **Fix:** a gateway or load balancer with *reads only* / *writes only* connections used to drop half the traffic without counting it as errors. Requests no connection carries now show up as errors.
- **One command to start everything:** `./start.sh` runs the backend, frontend and Claude terminal and opens the app. Ctrl+C stops all three.
- **Hide hints:** click **Hints (n)** to fold them away. A new hint, from the button or from Claude, opens them again.
- The terminal panel stops waiting after 3 s when ttyd is stuck and shows how to start it.

## 2026-11-26

- **Notes on the canvas:** free text blocks (Notes in the palette), and labels on connections.
- **Your own label on a block**, set in the Selected panel, shown as a tag under the block.
- **Copy, paste and duplicate** blocks: Cmd/Ctrl+C, Cmd/Ctrl+V, Cmd/Ctrl+D. Regions come with their contents.

## 2026-11-25

- **Cache fallback:** a cache can be set to *bypass* when it's down (cache-aside): requests go straight to the database.
- **Failover:** promote an SQL read replica to primary (`promote_replica`).
- **Uneven partitions:** with fewer consumers than partitions, the busiest consumer falls behind first.

## 2026-11-24

- **Kill single replicas:** a dot per replica on each block; Claude can kill and restore them.
- **SQL primary down:** writes fail, read replicas keep serving reads (`kill_primary`).
- **Four connection dots per block**, and drag a connection's end to reconnect it.
- **Quick quizzes** by topic (🧠 Quiz). Claude adds questions on what you got wrong to your own weak-spots quiz.
- **Terminal:** Claude runs inside tmux so a page reload keeps the session; drag the bar to resize.
- **New lessons:** web crawler, ad-click aggregation, key-value store.
