#!/bin/bash
# Builds the e2e bundle, starts the mock and vite preview, runs tests/e2e.cjs and tests/old-webview.cjs (the same screens in
# Chromium 67 and today), and always stops both servers.
# Usage: tools/e2e-local.sh [screenshots-dir]   (needs the harness: npm run harness -- ../habitica; old-webview pictures go to
# old-webview/; OLD_WEBVIEW=0 skips that part)
# Servers are started from node_modules/.bin directly so $! is the server's own pid, not an npx wrapper's.
set -euo pipefail
cd "$(dirname "$0")/.."
MOCK_PORT=${MOCK_PORT:-3001}        # baked into the e2e build as VITE_TEST_API
PREVIEW_PORT=${PREVIEW_PORT:-4173}  # tests/e2e.cjs default APP_URL (other ports let two checkouts run at once)
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

VITE_TEST_API=http://127.0.0.1:$MOCK_PORT VITE_AUTO_READ_MS=3000 node_modules/.bin/vite build --outDir dist-e2e --logLevel warn
node tools/mock-server.mjs --port "$MOCK_PORT" --rate 1000 >"/tmp/sidekick-mock-$MOCK_PORT.log" 2>&1 & PIDS+=($!)
node_modules/.bin/vite preview --outDir dist-e2e --host 127.0.0.1 --port "$PREVIEW_PORT" --strictPort >"/tmp/sidekick-preview-$PREVIEW_PORT.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$MOCK_PORT/mock/state" >/dev/null && curl -sf "http://127.0.0.1:$PREVIEW_PORT/" >/dev/null && break
  sleep 1
done
APP_URL="http://127.0.0.1:$PREVIEW_PORT/" MOCK_URL="http://127.0.0.1:$MOCK_PORT" node tests/e2e.cjs "${1:-screenshots}"
if [ "${OLD_WEBVIEW:-1}" != 0 ]; then
  APP_URL="http://127.0.0.1:$PREVIEW_PORT/" MOCK_URL="http://127.0.0.1:$MOCK_PORT" node --experimental-websocket tests/old-webview.cjs old-webview
fi
