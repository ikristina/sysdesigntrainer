#!/usr/bin/env bash
# Starts everything: backend (:8000), frontend (:5173), Claude terminal (ttyd :7681), then opens the app.
# Ctrl+C stops all three. Claude itself lives on in tmux, so the next start reattaches to it.
cd "$(dirname "$0")"
trap 'kill 0' INT TERM EXIT

(cd backend && uv run uvicorn app.main:app --reload --timeout-graceful-shutdown 2 --port 8000) &
(cd frontend && npm run dev) &
ttyd -W -O -i lo0 -p 7681 -t fontSize=15 tmux new -A -s sysdesign claude &

sleep 3 && open http://localhost:5173
wait
