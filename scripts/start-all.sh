#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "Starting SenseLoop backend at http://${BACKEND_HOST}:${BACKEND_PORT}"
(cd backend && HOST="$BACKEND_HOST" PORT="$BACKEND_PORT" python3 simple_server.py) &
BACKEND_PID=$!

if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install --cache ./.npm-cache
fi

echo "Starting SenseLoop frontend at http://127.0.0.1:5173"
npm run dev -- --host 127.0.0.1 --port 5173
