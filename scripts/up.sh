#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[up] Starting infra (Qdrant + Redis) ..."
(
  cd "$ROOT_DIR/infra"
  docker compose up -d
)

echo "[up] Verifying Qdrant ..."
curl -s http://127.0.0.1:6333/collections >/dev/null || echo "[warn] Qdrant not reachable yet"

echo "[up] Verifying Redis ..."
if docker ps --format '{{.Names}}' | grep -qi redis; then
  docker exec "$(docker ps --format '{{.Names}}' | grep -i redis | head -n1)" redis-cli ping || true
fi

echo "[up] Starting MCP server in background ..."
if pgrep -f "python mcp_server.py" >/dev/null; then
  echo "[up] MCP already running."
else
  nohup bash -lc ". .venv/bin/activate && python mcp_server.py" >/tmp/mcp_server.log 2>&1 &
  sleep 1
fi

echo "[up] Done. Logs: /tmp/mcp_server.log"

# --- Optional: Start local Ollama (Qwen 3) if available ---
if command -v ollama >/dev/null 2>&1; then
  echo "[up] Ensuring Ollama is serving ..."
  if ! curl -sSf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    nohup ollama serve >/tmp/ollama_server.log 2>&1 &
    sleep 2
  fi
  if curl -sSf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "[up] Ollama API reachable at 127.0.0.1:11434"
  else
    echo "[up] Ollama not reachable; check /tmp/ollama_server.log"
  fi
else
  echo "[up] Ollama not installed (skipping local Qwen)."
fi
