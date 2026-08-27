#!/bin/bash

# Script for generating actual JSON dialog between client and server.

set -e

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Configuration
SERVER_DIR="$(cd "../server" && pwd)"
DB_DIR="$SERVER_DIR"
SERVER_PORT=8182

# Kill lingering servers
echo "Cleaning up lingering servers..."
kill $(pgrep -f "port=$SERVER_PORT") 2>/dev/null || true

mkdir -p "$DB_DIR"
rm -f "$DB_DIR"/*.md
rm -f "$DB_DIR"/*.log

echo "Starting Server..."
uv run --no-sync --directory "$SERVER_DIR" server.py \
  --products_db_path="$DB_DIR/products.db" \
  --transactions_db_path="$DB_DIR/transactions.db" \
  --port=$SERVER_PORT > "$DB_DIR/server.log" 2>&1 &
SERVER_PID=$!

function cleanup {
  echo "Cleaning up..."
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for servers to start..."
for i in {1..10}; do
  if curl -s "http://localhost:$SERVER_PORT/.well-known/ucp" > /dev/null; then
    echo "Server is up!"
    break
  fi
  sleep 1
done

uv run --no-sync simple_happy_path_client.py \
  --server_url="http://localhost:$SERVER_PORT" \
  --export_requests_to="$DB_DIR/happy_path_dialog.md" || echo "FAILED: simple_happy_path_client.py"
