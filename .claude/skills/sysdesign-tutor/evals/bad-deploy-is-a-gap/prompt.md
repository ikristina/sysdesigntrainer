---
tags: [skill-creator]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

new twist idea: a bad deploy goes out to half the api servers and they answer 500 to every request for 2 min. what happens?

(Test harness: the sysdesign MCP server is offline. app-state.md says what get_lesson() and get_design() return right now. Instead of calling MCP tools, write every call you would make, in order and with arguments, to tool_calls.md (note any waits). Write your chat reply to the user to reply.md. Any edit you would make to docs/sim-gaps.md goes to the copy sim-gaps.md in the working directory.)

Input files: app-state.md, sim-gaps.md
