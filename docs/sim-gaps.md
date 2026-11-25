# Sim gaps

Lesson twists the simulator can't play faithfully. The tutor appends here during lessons (`.claude/skills/sysdesign-tutor/SKILL.md`, "Twist check"); a dev session picks them up and either rewords the lesson or builds the capability.

Entry format (append, newest last):

```
## <lesson id>: <the gap in a few words>
- twist: <the twist text, or the part that doesn't map>
- sim does: <what the tool call actually models>
- real system: <what would happen>
- suggest: lesson change: <new twist wording> | capability: <smallest sim change that models it>
```

## url-shortener: promotion keeps the read replica
- twist: "the postgres primary dies" (custom twist), then promote the replica to recover
- sim does: `kill_primary("db")` fails writes; reads go to the read replica. `restore_node("db")` brings the primary back with `read_replicas` unchanged.
- real system: promoting the only replica leaves a new primary with 0 replicas, so every cache-miss read hits the primary until a replacement replica catches up. With async replication, the last writes that never reached the replica are lost (RPO > 0).
- suggest: capability: `promote_replica(id)` = clear `primaryDown` and lower `read_replicas` by 1

## job-scheduler: partitions don't split evenly over fewer consumers
- twist: one of 45 workers dies mid-job: `kill_replica("w", 1)` with Kafka at 45 partitions
- sim does: `stream.ts` pools the group: min(44, 45) × 200 = 8.8k jobs/s ≥ 8k/s in, so lag stays flat
- real system: each partition has one owner, so after the rebalance one consumer owns 2 partitions: ~356/s against its 200/s. Those partitions' lag grows ~156 msgs/s while total capacity looks fine
- suggest: capability: in `stream.ts`, split partitions over live replicas (ceil/floor), cap each consumer at `capacity_rps`, and report the worst consumer's lag
