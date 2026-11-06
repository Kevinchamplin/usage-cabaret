#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for file in server.mjs claude-statusline.mjs claude-storage.mjs public/app.js; do
  node --check "$file"
done

check_dir="$(mktemp -d)"
export CABARET_STATE_DIR="$check_dir/state"
export CABARET_PORT="${CABARET_TEST_PORT:-4877}"
export CABARET_CODEX=/usr/bin/false
server_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$check_dir"
}
trap cleanup EXIT

printf '%s\n' '{"rate_limits":{"seven_day":{"used_percentage":31}},"session_id":"must-not-be-saved"}' | node claude-statusline.mjs
printf '%s\n' '{"rate_limits":{"five_hour":{"used_percentage":0}}}' | node claude-statusline.mjs

node server.mjs >"$check_dir/server.log" 2>&1 &
server_pid=$!
for attempt in {1..50}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$check_dir/server.log"
    exit 1
  fi
  if rg -q 'Usage Cabaret:' "$check_dir/server.log" 2>/dev/null || grep -q 'Usage Cabaret:' "$check_dir/server.log"; then
    break
  fi
  sleep .1
done

node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readingPath } from './claude-storage.mjs';

const base = `http://127.0.0.1:${process.env.CABARET_PORT}`;
const weekly = JSON.parse(await readFile(readingPath('seven_day'), 'utf8'));
assert.deepEqual(Object.keys(weekly).sort(), ['observedAt', 'resetsAt', 'used']);
const response = await fetch(base + '/api/usage');
assert.equal(response.status, 200);
const { claude, codex } = await response.json();
assert.deepEqual(claude.windows.map(({ minutes, used }) => [minutes, used]), [[300, 0], [10080, 31]]);
assert.equal(claude.issue, null);
assert.ok(codex.issue, 'Missing Codex must not prevent Claude quota from appearing');
const page = await fetch(base);
assert.equal(page.status, 200);
assert.match(await page.text(), /class="jacket"/);
assert.equal((await fetch(base + '/api/usage', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
console.log('Usage Cabaret checks passed.');
JS
