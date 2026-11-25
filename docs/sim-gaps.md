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
