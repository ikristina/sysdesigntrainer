# Backend entry point: /ws (the browser mirrors its state here) and /mcp (tools for Claude Code).
# See docs/SPEC.md "Architecture" and app/tools.py.
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .tools import link, mcp

LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}
mcp_app = mcp.streamable_http_app()  # serves /mcp; also creates mcp.session_manager


@asynccontextmanager
async def lifespan(_: FastAPI):
    # A mounted MCP app doesn't run its own lifespan, so the host must start its session manager.
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="System Design Trainer", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    # Browsers let any web page open a WebSocket to localhost, so only accept our own pages.
    # No Origin header = not a browser (tests, scripts), which can reach localhost anyway.
    origin = websocket.headers.get("origin")
    if origin and urlsplit(origin).hostname not in LOCAL_HOSTS:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    link.sockets.add(websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "state":
                link.state = msg["state"]
    except WebSocketDisconnect:
        pass
    finally:
        link.sockets.discard(websocket)


# Last: a mount at "/" matches every path, so routes above must come first.
app.mount("/", mcp_app)
