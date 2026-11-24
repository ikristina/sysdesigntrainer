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

## p99-fix: SQL primary dies, but kill_node takes the read replicas too
- twist: "The database primary dies for a minute. Apply with kill_node('db'), then restore_node('db')."
- sim does: the whole SQL block (primary + read replicas) goes to μ = 0, so reads fail too.
- real system: read replicas keep serving reads (possibly stale); writes fail until a replica is promoted (failover), and writes the primary hadn't shipped yet can be lost with async replication.
- suggest: capability: `kill_primary(id)` on SQL blocks: writes fail (or wait) for a failover time, reads keep going to replicas. Until then, lesson change: say in the twist that the sim drops reads too, and ask what really happens.
