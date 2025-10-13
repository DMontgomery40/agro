#!/usr/bin/env bash
set -euo pipefail

echo "[status] MCP server:"
if pgrep -f "server.mcp.server" >/dev/null; then
  echo "  running (pid(s): $(pgrep -f "server.mcp.server" | paste -sd, -))"
else
  echo "  not running"
fi

echo "[status] Docker services:"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | sed '1,1!b; s/ NAMES/NAME/; s/ STATUS/STATUS/'

echo "[status] Qdrant collections:"
curl -s http://127.0.0.1:6333/collections || echo "(qdrant not reachable)"
