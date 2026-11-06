# Usage Cabaret

Run `node server.mjs` on Node.js 22 or newer. Run `bash scripts/check.sh` before submitting a change.

The server binds to loopback on `CABARET_PORT` (default 4876). It reads Claude Code snapshots produced by `node claude-statusline.mjs`, and reads Codex account quota through the Codex app server. `CABARET_STATE_DIR` sets the snapshot directory for both processes, with `~/.usage-cabaret` as the default. `CABARET_CODEX` can override the Codex CLI command. Snapshot writes are atomic per quota window.

The stage artwork lives in `public/stage.svg` and is included in the page by the server. The fan and jacket share a 12-second animation cycle in `public/style.css`.
