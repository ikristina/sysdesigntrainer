# The browser <-> backend <-> MCP loop: state pushed over /ws is what the tools read,
# and write tools send a command back down the socket.
import anyio
import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from mcp.server.mcpserver.exceptions import ToolError

from app.main import app
from app.tools import link, mcp

STATE = {
    "design": {"version": 1, "nodes": [{"id": "svc", "type": "service", "params": {"replicas": 2}}, {"id": "r1", "type": "region", "params": {}}], "edges": []},
    "running": True,
    "global": {"p99Ms": 42},
}


@pytest.fixture(scope="module")
def client():
    # One client for the module: the MCP session manager can only start once per process.
    with TestClient(app) as c:
        yield c


def call(client: TestClient, name: str, args: dict | None = None):
    # Run the tool on the app's event loop, the same loop the websocket lives on.
    return client.portal.call(mcp.call_tool, name, args or {})


def test_tools_without_app_open_explain_why(client):
    with pytest.raises(ToolError, match="isn't open"):
        call(client, "get_design")


def test_mirror_and_commands(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "state", "state": STATE})
        client.portal.call(_wait_for_state)
        assert call(client, "get_design").structured_content["nodes"][0]["id"] == "svc"
        assert "design" not in call(client, "get_metrics").structured_content

        call(client, "kill_node", {"id": "svc"})
        assert ws.receive_json() == {"op": "kill_node", "args": {"id": "svc"}}
        call(client, "kill_replica", {"id": "svc"})
        assert ws.receive_json() == {"op": "kill_replica", "args": {"id": "svc", "count": 1}}
        call(client, "partition_region", {"id": "r1"})
        assert ws.receive_json() == {"op": "partition_region", "args": {"id": "r1"}}

        with pytest.raises(ToolError, match="No node"):
            call(client, "kill_node", {"id": "nope"})
        with pytest.raises(ToolError, match="not a region"):
            call(client, "partition_region", {"id": "svc"})
        with pytest.raises(ToolError, match="no replicas"):
            call(client, "kill_replica", {"id": "r1"})
        with pytest.raises(ToolError, match="rps"):
            call(client, "set_traffic", {"rps": 0})
        with pytest.raises(ToolError, match="followers"):
            call(client, "set_traffic", {"followers": -1})


async def _wait_for_state():
    with anyio.fail_after(2):
        while link.state is None:
            await anyio.sleep(0.01)


LESSON = {
    "id": "demo", "variants": [{"id": "a"}, {"id": "b"}], "steps": ["requirements", "design"],
    "step": 0, "step_name": "requirements", "_hints": ["q?", "direction", "answer"],
}


def test_lesson_tools(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "state", "state": {**STATE, "lesson": None}})
        client.portal.call(_wait_for, lambda: link.state.get("lesson", 1) is None)
        with pytest.raises(ToolError, match="No lesson"):
            call(client, "get_lesson")

        ws.send_json({"type": "state", "state": {**STATE, "lesson": LESSON}})
        client.portal.call(_wait_for, lambda: link.state.get("lesson"))
        assert "_hints" not in call(client, "get_lesson").structured_content

        assert call(client, "give_hint", {"level": 2}).structured_content["result"] == "direction"
        assert ws.receive_json() == {"op": "give_hint", "args": {"level": 2}}
        with pytest.raises(ToolError, match="level"):
            call(client, "give_hint", {"level": 4})

        call(client, "set_requirements", {"variant_id": "b", "rps": 500})
        assert ws.receive_json()["args"] == {
            "variant_id": "b", "requirements": None, "rps": 500, "read_ratio": None,
            "p99_ms": None, "error_pct": None, "max_cost_hr": None,
        }
        with pytest.raises(ToolError, match="No variant"):
            call(client, "set_requirements", {"variant_id": "zzz"})

        call(client, "advance_step")
        assert ws.receive_json() == {"op": "advance_step", "args": {}}
        ws.send_json({"type": "state", "state": {**STATE, "lesson": {**LESSON, "step": 1, "step_name": "design"}}})
        client.portal.call(_wait_for, lambda: link.state["lesson"]["step"] == 1)
        with pytest.raises(ToolError, match="last step"):
            call(client, "advance_step")


def test_get_quiz(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "state", "state": {**STATE, "quiz": None}})
        client.portal.call(_wait_for, lambda: link.state.get("quiz", 1) is None)
        assert call(client, "get_quiz").structured_content == {"on_screen": None, "misses": []}
        quiz = {"topic": "Caching", "number": 2, "of": 8, "question": "Which redirect?", "picked": None}
        miss = {"topic": "Caching", "q": "Which redirect?", "picked": "301", "answer": "302", "at": "2026-11-24T10:00:00Z"}
        ws.send_json({"type": "state", "state": {**STATE, "quiz": quiz, "quiz_misses": [miss]}})
        client.portal.call(_wait_for, lambda: link.state.get("quiz"))
        assert call(client, "get_quiz").structured_content == {"on_screen": quiz, "misses": [miss]}


COMPARE = {
    "id": "x", "scenarios": [{"id": "steady", "label": "Steady", "seconds": 30}],
    "_hints": ["question", "direction", "near-answer"], "verdict": "",
}


def test_compare_tools(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "state", "state": {**STATE, "compare": None}})
        client.portal.call(_wait_for, lambda: link.state.get("compare", 1) is None)
        with pytest.raises(ToolError, match="compare view"):
            call(client, "get_compare")

        ws.send_json({"type": "state", "state": {**STATE, "compare": COMPARE}})
        client.portal.call(_wait_for, lambda: link.state.get("compare"))
        assert "_hints" not in call(client, "get_compare").structured_content
        call(client, "run_scenario", {"scenario_id": "steady"})
        assert ws.receive_json() == {"op": "run_scenario", "args": {"id": "steady"}}
        with pytest.raises(ToolError, match="No scenario"):
            call(client, "run_scenario", {"scenario_id": "nope"})
        assert call(client, "give_hint", {"level": 1}).structured_content["result"] == "question"


async def _wait_for(ready):
    with anyio.fail_after(2):
        while not ready():
            await anyio.sleep(0.01)


def test_rejects_other_websites(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws", headers={"origin": "https://evil.example"}):
            pass
    with client.websocket_connect("/ws", headers={"origin": "http://localhost:5173"}):
        pass
