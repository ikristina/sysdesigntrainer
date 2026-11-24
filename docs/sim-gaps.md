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

## any lesson: deterministic failures are counted as random ones
- twist: any outage that fails one kind of request every time (kill_primary fails every write; kill_node behind a cache fails every miss and write)
- sim does: each block's failures become one fail share spread over all requests, and client retries are treated as independent tries (fails for good with p^retries). A 100% write outage at 5% writes shows as ~0.3% errors after 3 retries.
- real system: a retry of a write to a dead primary fails again; users see every write fail (5% of requests in p99-fix growth). kill_node on the p99-fix growth design shows 3.5% where writes + cache misses are ~14%.
- suggest: capability: track pathFail separately for reads and writes (handlers report dropped by type; SQL already knows primary vs replica drops), and only count a retry as independent for overload drops, not for dead targets.
