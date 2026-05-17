#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"

echo "Starting Vite dev server on port ${PORT}..."
npx vite --port "$PORT" &
VITE_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$VITE_PID" 2>/dev/null || true
  wait "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for Vite to be ready
echo "Waiting for dev server to be ready..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}" > /dev/null 2>&1; then
    echo "Dev server is ready."
    break
  fi
  sleep 1
done

echo "Starting Cloudflare tunnel..."
echo "Your public URL will appear below:"
echo ""
npx cloudflared tunnel --url "http://localhost:${PORT}"
