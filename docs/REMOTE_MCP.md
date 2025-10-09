# Remote MCP over HTTPS

This guide shows how to expose the MCP server over HTTPS for remote agents and OpenAI evals.

Server options
- HTTP MCP (FastMCP): `mcp_server_http.py` exposes `/mcp` via FastMCP (HTTP transport)
  - Env: `MCP_HTTP_HOST` (default `0.0.0.0`), `MCP_HTTP_PORT` (default `8013`), `MCP_HTTP_PATH` (default `/mcp`)
  - Start: `. .venv/bin/activate && python mcp_server_http.py`
- TLS: terminate with a reverse proxy (Caddy/Nginx) in front of `http://127.0.0.1:8013/mcp`

Quick start (local http)
```bash
. .venv/bin/activate
export MCP_HTTP_HOST=0.0.0.0 MCP_HTTP_PORT=8013 MCP_HTTP_PATH=/mcp
python mcp_server_http.py
# Test (replace host if remote):
curl -s "http://127.0.0.1:8013/mcp/tools/list" | head -n1
```

Caddy (HTTPS)
```caddyfile
your.domain.com {
  encode gzip
  reverse_proxy /mcp 127.0.0.1:8013
}
```

Nginx (HTTPS)
```nginx
server {
  listen 443 ssl;
  server_name your.domain.com;
  ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

  location /mcp {
    proxy_pass http://127.0.0.1:8013;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

OpenAI evals integration (HTTP MCP)
- Point the eval harness to `https://your.domain.com/mcp`
- Ensure network egress from eval runner to your domain
- If evals expect specific tool names, confirm `tools/list` shows `rag_answer`, `rag_search`, `netlify_deploy`, `web_get`

Operational tips
- Keep Redis/Qdrant running (`bash scripts/up.sh`) to ensure LangGraph checkpoints and hybrid search work.
- Use `bash scripts/status.sh` to verify MCP and containers.
- Secure your proxy with IP allowlists or auth if exposing publicly.

