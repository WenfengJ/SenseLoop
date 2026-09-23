#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"
PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)"

if [[ -z "$PIDS" ]]; then
  echo "No frontend dev server is listening on port $PORT."
  exit 0
fi

echo "Stopping frontend dev server on port $PORT: $PIDS"
kill $PIDS
echo "Stopped."
