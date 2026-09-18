#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

PORT="${PORT:-8000}"

echo "Starting SenseLoop backend at http://127.0.0.1:${PORT}"
echo "Using zero-dependency Python server."
PORT="$PORT" python3 simple_server.py
