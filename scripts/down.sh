#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Stop embedded editor if running
if [[ -f "$ROOT_DIR/scripts/editor_down.sh" ]]; then
  echo "[down] Stopping embedded editor..."
  bash "$ROOT_DIR/scripts/editor_down.sh" || true
fi

echo "[down] Stopping MCP server ..."
pkill -f "python mcp_server.py" 2>/dev/null || true

echo "[down] Stopping infra (Qdrant + Redis) ..."
(
  cd "$ROOT_DIR/infra"
  docker compose down
)

echo "[down] Done."

