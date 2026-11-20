# ttyd: the embedded Claude terminal

From Phase 3, the app has a terminal panel running Claude Code. That panel is **ttyd**: a small program that runs a command in a terminal and shows that terminal on a web page.

Sources: the ttyd README, man page, wiki, release notes and source (`src/server.c`, `src/http.c`, `src/protocol.c`) at https://github.com/tsl0922/ttyd, read 2026-11-20. The latest release there is 1.7.7.

## What it is

ttyd ("terminal over the web") is a single command-line program, written in C and MIT-licensed. You give it a command, here `claude`. It serves a web page, and anyone who opens the page gets a live terminal running that command.

It has two halves:
- **Server:** written in C on top of libwebsockets and libuv. It starts the command in a **pty** (pseudo-terminal), so the program sees a normal terminal, like the one in iTerm or Terminal.app.
- **Browser:** the page it serves contains **xterm.js**, the same browser terminal emulator VS Code uses. It draws the text and colours and sends your keystrokes back.

## How it works

```
Browser tab (localhost:5173, our app)
 └─ <iframe src="http://localhost:7681">           ← Phase 3 terminal panel
      │ 1. GET /        → ttyd's page (xterm.js)
      │ 2. GET /token   → auth token (empty unless -c is set)
      │ 3. WebSocket /ws ←→ keystrokes in, terminal output out
      ▼
ttyd :7681 ── spawns in a pty ──> claude (Claude Code, in the repo root)
                                    │ reads .mcp.json, connects over HTTP
                                    ▼
                                  FastAPI :8000/mcp  (our MCP server, Phase 3)
```

1. The iframe loads `/`. ttyd returns its page with xterm.js in it.
2. The page fetches `/token` and opens a WebSocket to `/ws`. A WebSocket is a long-lived two-way connection: one stays open for the whole session instead of a request/response per keystroke.
3. On the first message over that socket, ttyd **starts a new `claude` process** for this connection.
4. Keystrokes go browser → WebSocket → ttyd → the pty → `claude`. Output goes back the same way and xterm.js draws it.
5. When the tab closes or reloads, the socket closes. ttyd **kills that `claude` process** (SIGHUP by default; change it with `-s`).

The terminal is only for you to talk to Claude. Claude acts on the app through the MCP server at `:8000/mcp`, not through the terminal. That's why `claude` must run from the repo root, where it finds `.mcp.json`.

### What this means for the app

- **One `claude` per connection.** Two tabs open means two separate Claude sessions.
- **Reloading the page restarts Claude.** The old session is killed and a fresh one starts. If that becomes annoying, run Claude inside tmux, which keeps the session alive across reloads (needs `brew install tmux`):
  ```bash
  ttyd -W -i lo0 -p 7681 tmux new -A -s sysdesign claude
  ```
  `new -A -s sysdesign` attaches to the tmux session named `sysdesign`, or creates it if it doesn't exist.
- **The app can't script the terminal.** Port 5173 and port 7681 are different origins, so the browser blocks our page from reading or typing into the iframe. That's fine, because app↔Claude communication goes over MCP.
- **Embedding works.** ttyd sends no `X-Frame-Options` or CSP `frame-ancestors` headers, so the browser lets our page frame it.

## The command we use

```bash
ttyd -W -i lo0 -p 7681 claude        # from the repo root
```

| Flag | Meaning |
|---|---|
| `-W`, `--writable` | Let the browser type into the terminal. **Needed:** since ttyd 1.7.4 terminals are read-only by default, and keystrokes are silently dropped without it. |
| `-p 7681`, `--port` | Port to listen on. 7681 is the default; we pass it to be explicit. |
| `claude` | The command to run. Anything after the flags is the command plus its arguments. |

Other flags you might want:

| Flag | Meaning |
|---|---|
| `-i lo0`, `--interface` | Network interface to bind. `lo0` is macOS's loopback (127.0.0.1), so only this machine can connect. See Security below. |
| `-c user:pass`, `--credential` | HTTP basic auth on the page and the WebSocket. |
| `-O`, `--check-origin` | Reject WebSockets from other origins. It doesn't block our iframe, since the iframe's own origin is 7681. |
| `-m N`, `--max-clients` | Max concurrent connections (0 = unlimited, the default). `-m 1` stops a second tab from starting a second Claude. |
| `-o`, `--once` | Accept one client, then exit when it disconnects. |
| `-q`, `--exit-no-conn` | Exit when the last client disconnects. |
| `-w DIR`, `--cwd` | Working directory for the command, instead of where you ran ttyd. |
| `-t key=value`, `--client-option` | Browser terminal settings, e.g. `-t fontSize=14`, `-t 'theme={"background":"#1B1B1F"}'`, `-t disableReconnect=true`. |
| `-s SIG`, `--signal` | Signal sent to the command when the tab closes (default SIGHUP). |

## Security

`-W` with no `-c` means anyone who can reach port 7681 can type into a Claude Code session that runs as you, in this repo, with your tools. Keep it local:

- **By default ttyd listens on every network interface.** That means other machines on your Wi-Fi can reach it. Always pass `-i lo0`, which every command in this repo does:
  ```bash
  ttyd -W -i lo0 -p 7681 claude
  ```
- Check what it's listening on (`2>/dev/null` hides harmless macOS lsof warnings):
  ```bash
  lsof -nP -iTCP:7681 -sTCP:LISTEN 2>/dev/null
  ```
  `127.0.0.1:7681` means local only. `*:7681` means every network interface.

Verified 2026-11-20 with ttyd 1.7.7 (Homebrew) on macOS:
- Without `-i`, lsof showed `TCP *:7682 (LISTEN)`, so it was reachable from the network.
- With `-i lo0`, lsof showed `TCP 127.0.0.1:7683 (LISTEN)`, so it was local only.
- `GET /` returned 200 with no `X-Frame-Options` or CSP header, so the iframe embedding works.

The `-W` typing check is still to do: open the page in a browser and type, during Phase 3 setup.

## Install and check

```bash
brew install ttyd
ttyd --version
cd <repo root> && ttyd -W -i lo0 -p 7681 claude
# open http://localhost:7681 directly first, to check it works outside the app
```

## Troubleshooting

- **The terminal shows but typing does nothing:** `-W` is missing.
- **"Address already in use":** another ttyd is running. Find it with `lsof -nP -iTCP:7681`, or use another port.
- **Claude has no `sysdesign` tools:** `claude` wasn't started from the repo root (no `.mcp.json` there), or the backend on :8000 isn't running.
- **Every reload loses the conversation:** expected (see above). Use the tmux variant.
