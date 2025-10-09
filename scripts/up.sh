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
# Wait briefly for Qdrant to accept connections (avoid confusing first-run warning)
ATTEMPTS=0
until curl -sSf http://127.0.0.1:6333/collections >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ "$ATTEMPTS" -ge 20 ]; then
    echo "[warn] Qdrant not reachable yet"
    break
  fi
  sleep 0.4
done

echo "[up] Verifying Redis ..."
if docker ps --format '{{.Names}}' | grep -qi redis; then
  docker exec "$(docker ps --format '{{.Names}}' | grep -i redis | head -n1)" redis-cli ping || true
fi

echo "[up] Starting MCP server in background ..."
if pgrep -f "python mcp_server.py" >/dev/null; then
  echo "[up] MCP already running."
else
  if [ -f "$ROOT_DIR/.venv/bin/python" ] || [ -f "$ROOT_DIR/.venv/Scripts/python.exe" ]; then
    nohup bash -lc ". $ROOT_DIR/.venv/bin/activate 2>/dev/null || true; python mcp_server.py" >/tmp/mcp_server.log 2>&1 &
    sleep 1
    echo "[up] MCP started (see /tmp/mcp_server.log)"
  else
    # Guided path for first‑run setups if interactive terminal detected
    if [ -t 0 ] && [ "${AUTO_SETUP:-1}" != "0" ]; then
      echo "[up] No virtualenv found. Start guided setup now? [Y/n] "
      read -r yn
      yn=${yn:-Y}
      case "$yn" in
        [Yy]*)
          echo "Path to your code repo (absolute, not this folder):"
          read -r user_repo_path
          user_repo_path=${user_repo_path:-$PWD}
          echo "Repo name (letters, numbers, dashes) [optional]:"
          read -r user_repo_name || true
          echo "[up] Running setup ..."
          bash "$ROOT_DIR/scripts/setup.sh" "$user_repo_path" "${user_repo_name:-}"
          if [ -f "$ROOT_DIR/.venv/bin/python" ] || [ -f "$ROOT_DIR/.venv/Scripts/python.exe" ]; then
            nohup bash -lc ". $ROOT_DIR/.venv/bin/activate 2>/dev/null || true; python mcp_server.py" >/tmp/mcp_server.log 2>&1 &
            sleep 1
            echo "[up] MCP started (see /tmp/mcp_server.log)"
            # Offer to launch interactive chat
            echo "Launch interactive chat now? [Y/n] "
            read -r chatyn
            chatyn=${chatyn:-Y}
            case "$chatyn" in
              [Yy]*)
                . "$ROOT_DIR/.venv/bin/activate" 2>/dev/null || true
                python "$ROOT_DIR/chat_cli.py"
                ;;
              *) ;;
            esac
          else
            echo "[warn] Setup did not create .venv; skipping MCP start."
          fi
          ;;
        *)
          echo "[up] Skipping MCP start: .venv not found."
          echo "     Run 'bash scripts/setup.sh /abs/path/to/your/repo your-repo' to install deps and configure."
          ;;
      esac
    else
      echo "[up] Skipping MCP start: .venv not found."
      echo "     Run 'bash scripts/setup.sh /abs/path/to/your/repo your-repo' to install deps and configure."
    fi
  fi
fi

echo "[up] Done."

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
