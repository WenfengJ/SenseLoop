#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-frontend}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${PORT:-8000}"

stop_port() {
  local port="$1"
  local name="$2"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"

  if [[ -z "$pids" ]]; then
    echo "No $name is listening on port $port."
    return
  fi

  echo "Stopping $name on port $port: $pids"
  kill $pids
}

start_frontend() {
  cd "$ROOT_DIR"
  if [[ ! -d "node_modules" ]]; then
    echo "Installing frontend dependencies..."
    npm install --cache ./.npm-cache
  fi
  echo "Starting SenseLoop frontend at http://127.0.0.1:${FRONTEND_PORT}"
  npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
}

start_backend() {
  cd "$ROOT_DIR"
  echo "Starting SenseLoop backend at http://127.0.0.1:${BACKEND_PORT}"
  PORT="$BACKEND_PORT" ./scripts/start-backend.sh
}

case "$TARGET" in
  frontend)
    stop_port "$FRONTEND_PORT" "frontend dev server"
    start_frontend
    ;;
  backend)
    stop_port "$BACKEND_PORT" "backend server"
    start_backend
    ;;
  all)
    stop_port "$FRONTEND_PORT" "frontend dev server"
    stop_port "$BACKEND_PORT" "backend server"
    start_backend &
    BACKEND_PID="$!"
    trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT
    start_frontend
    ;;
  *)
    echo "Usage: $0 [frontend|backend|all]"
    echo "Examples:"
    echo "  $0"
    echo "  $0 frontend"
    echo "  $0 backend"
    echo "  $0 all"
    exit 1
    ;;
esac
