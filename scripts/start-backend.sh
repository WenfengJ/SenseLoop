#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "Starting SenseLoop backend at http://${HOST}:${PORT}"
echo "Using zero-dependency Python server."
HOST="$HOST" PORT="$PORT" python3 simple_server.py
