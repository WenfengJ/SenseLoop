#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "Starting SenseLoop backend at http://${HOST}:${PORT}"

if [ "${USE_SIMPLE_BACKEND:-0}" = "1" ]; then
  echo "Using zero-dependency Python server."
  HOST="$HOST" PORT="$PORT" python3 simple_server.py
  exit 0
fi

if [ ! -x ".venv/bin/uvicorn" ]; then
  echo "FastAPI dependencies are missing. Run:"
  echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  echo "Or start the old mock server with:"
  echo "  USE_SIMPLE_BACKEND=1 bash scripts/start-backend.sh"
  exit 1
fi

PYTHONPATH=. .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"
