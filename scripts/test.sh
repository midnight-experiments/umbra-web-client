#!/usr/bin/env bash
# The Web round trip from a clean checkout: builds the C-ABI wasm and the test server in the Rust repository
# (RUST_CLIENT, default ../universal-gpu-reinspire-client), starts the server with this folder as its web root, runs the
# round trip in Node, then in a headless Chrome (skipped with BROWSER=none), and checks every report matched.
#
#   scripts/test.sh                 PORT (8787), RUST_CLIENT, BROWSER (path to a Chrome-compatible browser, or none)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RUST="$(cd "${RUST_CLIENT:-$HERE/../universal-gpu-reinspire-client}" && pwd)"
PORT="${PORT:-8787}"
BASE="http://127.0.0.1:$PORT"
BROWSER="${BROWSER:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

"$RUST/scripts/build-web.sh"
"$RUST/scripts/build-server.sh"
cp "$RUST/dist/web/pss-ipir.wasm" "$HERE/pss-ipir.wasm"

mkdir -p "$HERE/results"
REPORTS="$HERE/results/reports.jsonl"
: > "$REPORTS"
if curl -s -o /dev/null "$BASE/tables"; then echo "port $PORT is already in use" >&2; exit 1; fi
"$RUST/target/release/ps-server" --port "$PORT" --web "$HERE" --reports "$REPORTS" \
  --table 2048x2048 --table 8192x4096 --table 32768x2048 > "$HERE/results/server.log" 2>&1 &
SERVER=$!
PROFILE="$(mktemp -d)"
cleanup() {
  if [[ -n "${CHROME:-}" ]]; then kill "$CHROME" 2>/dev/null || true; wait "$CHROME" 2>/dev/null || true; fi
  kill "$SERVER" 2>/dev/null || true
  wait "$SERVER" 2>/dev/null || true
  rm -rf "$PROFILE" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 120); do curl -s -o /dev/null "$BASE/tables" && break; sleep 0.5; done

echo "== Node"
node "$HERE/node-run.mjs" "$BASE"

if [[ "$BROWSER" != none && -x "$BROWSER" ]]; then
  echo "== Browser (headless): $BROWSER"
  "$BROWSER" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" "http://localhost:$PORT/" \
    > "$HERE/results/browser.log" 2>&1 &
  CHROME=$!
  for _ in $(seq 1 120); do [[ "$(grep -c '"web-browser"' "$REPORTS")" -ge 3 ]] && break; sleep 0.5; done
  grep '"web-browser"' "$REPORTS" || { echo "the browser posted no report" >&2; exit 1; }
  [[ "$(grep -c '"web-browser"' "$REPORTS")" -eq 3 ]] || { echo "the browser did not report 3 tables" >&2; exit 1; }
else
  echo "== Browser skipped (BROWSER=$BROWSER)"
fi

if grep -q '"match":false' "$REPORTS"; then echo "FAIL: a decoded row differs" >&2; exit 1; fi
echo "PASS: $(wc -l < "$REPORTS" | tr -d ' ') reports, every decoded row equals the table's row"
