#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install --cache ./.npm-cache
fi

echo "Starting SenseLoop frontend at http://127.0.0.1:5173"
npm run dev -- --host 127.0.0.1 --port 5173
