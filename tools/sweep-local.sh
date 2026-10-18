#!/bin/bash
# Builds the simulator, serves it, runs the bug sweep (tests/sweep.cjs) over it, and always stops the server.
# Usage: tools/sweep-local.sh [report.json]   (needs the harness: npm run harness -- ../habitica)
# SWEEP_ONLY=warrior,odd limits the accounts; SWEEP_TAPS=0 skips the random taps; SIM_PORT picks the port.
set -euo pipefail
cd "$(dirname "$0")/.."
SIM_PORT=${SIM_PORT:-4300}
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
node tools/build-sim.mjs
node_modules/.bin/vite preview --outDir dist-sim --host 127.0.0.1 --port "$SIM_PORT" --strictPort >"/tmp/sidekick-sim-$SIM_PORT.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$SIM_PORT/" >/dev/null && break; sleep 1; done
SIM_URL="http://127.0.0.1:$SIM_PORT/" node tests/sweep.cjs "${1:-sweep-report.json}"
