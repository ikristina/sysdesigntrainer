# MCP server: the tools Claude Code calls (see docs/SPEC.md, "MCP tools").
# The backend never simulates. The browser pushes a snapshot of its state over /ws about once a
# second (`link.state`), read tools return that snapshot, and write tools send a command back to
# the browser, which applies it to its own stores.
from typing import Any

from fastapi import WebSocket
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError


class Link:
    """The browser tabs connected to /ws and the last state one of them sent."""

    def __init__(self) -> None:
        self.state: dict[str, Any] | None = None
        self.sockets: set[WebSocket] = set()

    def snapshot(self) -> dict[str, Any]:
        if not self.sockets or self.state is None:
            raise ToolError("The app isn't open. Ask the user to open http://localhost:5173 in a browser.")
        return self.state

    def node(self, node_id: str) -> dict[str, Any]:
        for n in self.snapshot()["design"]["nodes"]:
            if n["id"] == node_id:
                return n
        raise ToolError(f"No node {node_id!r}. Call get_design for the ids.")

    def lesson(self) -> dict[str, Any]:
        lesson = self.snapshot().get("lesson")
        if not lesson:
            raise ToolError("No lesson is open. Ask the user to pick one from the mode menu in the app header.")
        return lesson

    def compare(self) -> dict[str, Any]:
        compare = self.snapshot().get("compare")
        if not compare:
            raise ToolError("The compare view isn't open. Ask the user to pick one under Compare in the mode menu.")
        return compare

    async def send(self, op: str, **args: Any) -> None:
        self.snapshot()
        # ponytail: every open tab gets the command and the last tab to report wins the mirror;
        # fine for one user, track a single "active" tab if two tabs fight.
        for ws in list(self.sockets):
            await ws.send_json({"op": op, "args": args})


link = Link()

mcp = MCPServer(
    "sysdesign",
    instructions=(
        "Tools for the System Design Trainer app the user has open in their browser. "
        "The app simulates a system design under load (a queueing model, not real traffic). "
        "Read the design and live metrics with get_design and get_metrics; change load and inject "
        "failures with the other tools. Metrics refresh about once a second, so wait a few seconds "
        "after a change before judging its effect. Node ids come from get_design. "
        "When a lesson is open, get_lesson returns its brief, requirements, current step, the user's "
        "notes and the live pass/fail checks; tutor_notes holds the intended math. Give hints in order. "
        "In the compare view (two designs, same scenario), use get_compare and run_scenario instead: "
        "there's no overall winner, so challenge the user's verdict against their requirements. "
        "When the user asks about a quiz question (\"this question\", \"why is it B?\"), call get_quiz "
        "for the question on screen; until they answer it, help them think it through without giving the answer. "
        "get_quiz also lists the quiz questions they got wrong: use them, and anything they struggle with in a "
        "lesson or in chat, to add questions to quizzes/weak-spots.json (rules in CLAUDE.md, 'Weak-spots quiz')."
    ),
)


@mcp.tool()
def get_design() -> dict[str, Any]:
    """The user's design: nodes (id, type, params, parentId = the region/AZ it sits in, label = the user's own
    text on it) and edges (label = the user's text on the connection). A node of type "note" is free text on
    the canvas: its label is the text; it has no connections and the simulator ignores it."""
    return link.snapshot()["design"]


@mcp.tool()
def get_metrics() -> dict[str, Any]:
    """Latest simulator output. global: offered rps, throughput, errorPct, p50Ms, p99Ms, costHr.
    nodes: per node lambda (rps in), mu (capacity rps), rho (utilization), queue, dropped (rps),
    latencyMs (own), pathMs/pathFail (including everything downstream), health, note.
    Also the traffic settings, whether the sim is running, and which nodes are killed/partitioned."""
    return {k: v for k, v in link.snapshot().items() if k != "design"}


@mcp.tool()
async def run(on: bool = True) -> str:
    """Start (on=true) or pause (on=false) the simulation."""
    await link.send("run", on=on)
    return "running" if on else "paused"


@mcp.tool()
async def set_traffic(
    rps: float | None = None, read_ratio: float | None = None, hot_key: float | None = None,
    payload_kb: float | None = None, followers: float | None = None, following: float | None = None,
) -> str:
    """Set total client traffic (requests per second, 1 to 1,000,000), the share of reads (0 to 1),
    and/or:
    - hot_key: the share of all requests (0 to 1) that go to one single key (a celebrity
      profile, a flash-sale item). Partitioned stores like DynamoDB throttle a hot key.
    - payload_kb: response size per read in KB (0 to 100,000). Only per-GB prices use it (CloudFront).
    - followers: copies each write fans out to on edges marked fanout "write" (0 to 10,000,000).
    - following: fetches each read gathers on edges marked fanout "read" (0 to 100,000).
    Omitted values stay as they are."""
    checks = [
        ("rps", rps, 1, 1_000_000), ("read_ratio", read_ratio, 0, 1), ("hot_key", hot_key, 0, 1),
        ("payload_kb", payload_kb, 0, 100_000), ("followers", followers, 0, 10_000_000), ("following", following, 0, 100_000),
    ]
    for name, value, lo, hi in checks:
        if value is not None and not lo <= value <= hi:
            raise ToolError(f"{name} must be between {lo:,} and {hi:,}")
    args = {name: value for name, value, _, _ in checks}
    await link.send("set_traffic", **args)
    return "traffic set: " + ", ".join(f"{k}={v}" for k, v in args.items()) + " (None = unchanged)"


@mcp.tool()
async def spike(multiplier: float = 3, seconds: float = 10) -> str:
    """Multiply traffic by `multiplier` for `seconds` of sim time. Only advances while the sim runs."""
    if not 1 <= multiplier <= 100 or not 0 < seconds <= 600:
        raise ToolError("multiplier must be 1-100 and seconds 1-600")
    await link.send("spike", multiplier=multiplier, seconds=seconds)
    paused = "" if link.snapshot().get("running") else " The sim is paused; call run to start it."
    return f"spike x{multiplier} for {seconds}s.{paused}"


@mcp.tool()
async def kill_node(id: str) -> str:
    """Take a node down (capacity 0). Killing a region or AZ kills everything inside it."""
    link.node(id)
    await link.send("kill_node", id=id)
    return f"{id} killed"


def _replica_count(id: str, count: int) -> None:
    replicas = link.node(id)["params"].get("replicas")
    if not isinstance(replicas, int):
        raise ToolError(f"{id} has no replicas param")
    if not 1 <= count <= replicas:
        raise ToolError(f"count must be 1..{replicas} ({id} has {replicas} replicas)")


@mcp.tool()
async def kill_replica(id: str, count: int = 1) -> str:
    """Take `count` replicas of a block down; the rest keep serving (μ = live replicas × capacity_rps).
    Losing all of them is the same as kill_node. Only for blocks with a `replicas` param."""
    _replica_count(id, count)
    await link.send("kill_replica", id=id, count=count)
    return f"{count} replica(s) of {id} down"


@mcp.tool()
async def restore_replica(id: str, count: int = 1) -> str:
    """Bring `count` dead replicas of a block back (see kill_replica)."""
    _replica_count(id, count)
    await link.send("restore_replica", id=id, count=count)
    return f"{count} replica(s) of {id} restored"


@mcp.tool()
async def kill_primary(id: str) -> str:
    """Kill an SQL DB's primary: writes fail, reads keep going to its read replicas (none = reads fail too).
    No automatic failover: promote_replica fails over, restore_node brings the old primary back."""
    if "read_replicas" not in link.node(id)["params"]:  # single-primary SQL: SQL DB, Postgres, MySQL. Not the type: CockroachDB is SQL with no single primary, and drops this param
        raise ToolError(f"{id} is not a single-primary SQL DB")
    await link.send("kill_primary", id=id)
    return f"{id} primary down"


@mcp.tool()
async def promote_replica(id: str) -> str:
    """Fail an SQL DB over: one read replica becomes the primary, so writes work again and
    read_replicas drops by 1 (raise it to add a new replica). Writes the replica never got aren't lost in the sim."""
    replicas = link.node(id)["params"].get("read_replicas")
    if not isinstance(replicas, int) or replicas < 1:
        raise ToolError(f"{id} has no read replica to promote")
    await link.send("promote_replica", id=id)
    return f"{id}: a replica is the new primary, {replicas - 1} read replica(s) left"


@mcp.tool()
async def restore_node(id: str) -> str:
    """Undo kill_node, kill_replica, kill_primary or partition_region for this node."""
    link.node(id)
    await link.send("restore_node", id=id)
    return f"{id} restored"


@mcp.tool()
async def partition_region(id: str) -> str:
    """Cut the network at a region's border: every edge crossing it fails. Blocks inside keep running."""
    if link.node(id)["type"] != "region":
        raise ToolError(f"{id} is not a region")
    await link.send("partition_region", id=id)
    return f"{id} partitioned"


@mcp.tool()
async def highlight(node_ids: list[str], message: str = "") -> str:
    """Draw attention to nodes on the canvas, with an optional short message. An empty list clears it."""
    for i in node_ids:
        link.node(i)
    await link.send("highlight", node_ids=node_ids, message=message)
    return "highlighted" if node_ids else "highlight cleared"


@mcp.tool()
def get_lesson() -> dict[str, Any]:
    """The open lesson: brief, variants, active requirements (variant plus any custom changes), steps and
    the current one, the user's notes per step, hints shown so far, live success checks, held_s (seconds
    the checks have stayed green at the required traffic; hold_s to pass), passed variants, tutor_notes."""
    return {k: v for k, v in link.lesson().items() if k != "_hints"}


@mcp.tool()
async def set_requirements(
    variant_id: str | None = None,
    requirements: list[str] | None = None,
    rps: float | None = None,
    read_ratio: float | None = None,
    p99_ms: float | None = None,
    error_pct: float | None = None,
    max_cost_hr: float | None = None,
) -> str:
    """Change the lesson's requirements. variant_id switches to one of the lesson's variants (clearing
    custom changes); the other fields change requirements on top of it (a twist). Traffic follows."""
    lesson = link.lesson()
    if variant_id is not None and variant_id not in [v["id"] for v in lesson["variants"]]:
        raise ToolError(f"No variant {variant_id!r}. Variants: {[v['id'] for v in lesson['variants']]}")
    if rps is not None and not 1 <= rps <= 1_000_000:
        raise ToolError("rps must be between 1 and 1,000,000")
    if read_ratio is not None and not 0 <= read_ratio <= 1:
        raise ToolError("read_ratio must be between 0 and 1")
    if any(x is not None and x <= 0 for x in (p99_ms, error_pct, max_cost_hr)):
        raise ToolError("p99_ms, error_pct and max_cost_hr must be positive")
    await link.send(
        "set_requirements", variant_id=variant_id, requirements=requirements, rps=rps,
        read_ratio=read_ratio, p99_ms=p99_ms, error_pct=error_pct, max_cost_hr=max_cost_hr,
    )
    return "requirements updated; the pass timer restarts. Call get_lesson to see them."


@mcp.tool()
async def advance_step() -> str:
    """Move the lesson to its next step (requirements, estimation, ..., postmortem)."""
    lesson = link.lesson()
    if lesson["step"] >= len(lesson["steps"]) - 1:
        raise ToolError(f"Already at the last step ({lesson['step_name']}).")
    await link.send("advance_step")
    return f"now at step {lesson['step'] + 2}: {lesson['steps'][lesson['step'] + 1]}"


@mcp.tool()
async def give_hint(level: int) -> str:
    """Show hint `level` (1 = a question, 2 = a direction, 3 = a near-answer) in the app and return its text.
    Earlier hints are shown too."""
    snap = link.snapshot()
    hints = (link.compare() if snap.get("compare") else link.lesson())["_hints"]
    if not 1 <= level <= len(hints):
        raise ToolError(f"level must be 1-{len(hints)}")
    await link.send("give_hint", level=level)
    return hints[level - 1]


@mcp.tool()
def get_quiz() -> dict[str, Any]:
    """on_screen: the 🧠 Quiz question on screen, or null. It has topic, number and of (question
    count), the question, choices, the choice the user picked (null until they answer), and after
    they answer: the right answer, why, and the study note it comes from (docs/study-notes.md).
    When the topic is finished: done, right, of.
    misses: questions the user got wrong (topic, q, picked, answer, at), oldest first, up to 30. A
    question leaves the list once they answer it right. Write weak-spot questions from these."""
    state = link.snapshot()
    return {"on_screen": state.get("quiz"), "misses": state.get("quiz_misses", [])}


@mcp.tool()
def get_compare() -> dict[str, Any]:
    """The compare view: the two sides (labels and designs), the scenarios and which one is
    running, sim time, live global metrics per side, and the A/B table (metric, a, b, better =
    "A"/"B"/null). Also the questions the verdict should answer, the user's verdict text, hints
    shown, and tutor_notes (the intended numbers). Metrics in the snapshot are rounded."""
    return {k: v for k, v in link.compare().items() if k != "_hints"}


@mcp.tool()
async def run_scenario(scenario_id: str) -> str:
    """Pick a scenario in the compare view and run it from t = 0 on both sides."""
    compare = link.compare()
    scenario = next((s for s in compare["scenarios"] if s["id"] == scenario_id), None)
    if scenario is None:
        raise ToolError(f"No scenario {scenario_id!r}. Options: {', '.join(s['id'] for s in compare['scenarios'])}")
    await link.send("run_scenario", id=scenario_id)
    return f"running {scenario['label']} ({scenario['seconds']} s of sim time). Call get_compare when it's done."

