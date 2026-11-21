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
        "notes and the live pass/fail checks; tutor_notes holds the intended math. Give hints in order."
    ),
)


@mcp.tool()
def get_design() -> dict[str, Any]:
    """The user's design: nodes (id, type, params, parentId = the region/AZ it sits in) and edges."""
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
async def set_traffic(rps: float | None = None, read_ratio: float | None = None, hot_key: float | None = None) -> str:
    """Set total client traffic (requests per second, 1 to 1,000,000), the share of reads (0 to 1),
    and/or hot_key: the share of all requests (0 to 1) that go to one single key (a celebrity
    profile, a flash-sale item). Partitioned stores like DynamoDB throttle a hot key."""
    if rps is not None and not 1 <= rps <= 1_000_000:
        raise ToolError("rps must be between 1 and 1,000,000")
    if read_ratio is not None and not 0 <= read_ratio <= 1:
        raise ToolError("read_ratio must be between 0 and 1")
    if hot_key is not None and not 0 <= hot_key <= 1:
        raise ToolError("hot_key must be between 0 and 1")
    await link.send("set_traffic", rps=rps, read_ratio=read_ratio, hot_key=hot_key)
    return f"traffic set: rps={rps}, read_ratio={read_ratio}, hot_key={hot_key} (None = unchanged)"


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


@mcp.tool()
async def restore_node(id: str) -> str:
    """Undo kill_node or partition_region for this node."""
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
    hints = link.lesson()["_hints"]
    if not 1 <= level <= len(hints):
        raise ToolError(f"level must be 1-{len(hints)}")
    await link.send("give_hint", level=level)
    return hints[level - 1]
