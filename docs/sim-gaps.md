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
