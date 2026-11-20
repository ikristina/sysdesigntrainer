# Backend entry point. Phase 1: health route only.
# Phase 3 adds the /ws websocket mirror and the /mcp server (see docs/SPEC.md).
from fastapi import FastAPI

app = FastAPI(title="System Design Trainer")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
