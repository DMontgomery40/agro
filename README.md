![AGRO Banner](docs/images/agro-hero-banner.png)


---

This is a RAG (Retrieval-Augmented Generation) engine that:
- Maintains **strict separation** between repositories (never mixes them)
- Uses **hybrid search** (BM25 + dense embeddings + reranking)
- Provides **MCP tools** (stdio + HTTP modes) for Codex and Claude Code
- Includes **eval harness** with regression tracking
- Supports **multi-query expansion** and **local code hydration**
- Features **interactive CLI chat** with conversation memory

### Positioning (what we are — and aren’t)
- RAG-first: this repo is the retrieval + answer engine (your runtime).
- Codex/Claude are clients that call into this engine via MCP; they “wrap” the RAG, not the other way around.
- We are not an agent framework. We expose MCP tools (rag_answer, rag_search); external UIs invoke them.
- Your code and indexes remain local; MCP registration simply plugs your RAG into external UIs.

### Storage Planning Tool

AGRO enables significant flexibility in configuration—but with great power comes great storage bills. Depending on your choices (embeddings, hydration, replication, etc.), you could easily reach 20× your original repository size. Commercial RAGs are expensive for precisely this reason.

**Use our interactive storage calculator to plan your deployment:**

[![AGRO Storage Calculator](docs/images/rag-calculator-screenshot.png)](https://vivified.dev/rag-calculator.html)

**[→ Open the AGRO Storage Calculator](https://vivified.dev/rag-calculator.html)**

The calculator lets you:
- Estimate storage needs for your specific configuration
- Compare minimal vs. low-latency deployment strategies
- Factor in replication, hydration, and precision settings
- See exactly how much storage each component requires

## RAG for Code — Comparative Matrix

*Legend:* ✅ = present/native · 🟨 = partial / configurable / undocumented · ❌ = absent

| Feature ↓ · Tool → | **AGRO (rag-service)** | **Sourcegraph Cody** | **GitHub Copilot Ent.** | **Cursor** | **Codeium / Windsurf** | **Tabnine** | **Continue.dev (OSS)** | **LlamaIndex – Code (OSS)** | **Claude Code** | **JetBrains AI Assistant** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **OSS code available** | 🟨 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Commercial plan exists** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | 🟨 | ✅ | ✅ |
| **Dense embeddings** | ✅ | ❌ | 🟨 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ |
| **Hybrid (sparse + dense)** | ✅ | ❌ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 |
| **AST / code-graph chunking** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 🟨 | ✅ | ❌ | ✅ |
| **Reranker present** | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | ✅ | ✅ | 🟨 | 🟨 |
| **Incremental / streaming re-index** | ✅ | 🟨 | 🟨 | ✅ | ✅ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 |
| **Symbol graph / LSP integration** | ❌ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | ❌ | ✅ |
| **Multi-language** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cross-file reasoning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ | ✅ |
| **Citations include path+line** | ✅ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 |
| **Vector DB explicitly noted** | ✅ | ❌ | 🟨 | ✅ | 🟨 | ✅ | 🟨 | ✅ | ❌ | 🟨 |
| **IDE / CLI available** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ | ✅ |
| **MCP / API connectors** | ✅ | ✅ | 🟨 | ✅ | ✅ | 🟨 | ✅ | ❌ | ✅ | ✅ |
| **GitHub / CI hooks** | 🟨 | ✅ | ✅ | 🟨 | ✅ | 🟨 | ✅ | 🟨 | 🟨 | 🟨 |
| **Local-first option** | ✅ | ✅ | ❌ | 🟨 | ✅ | ✅ | ✅ | ✅ | 🟨 | ❌ |
| **Telemetry / data controls** | 🟨 | 🟨 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ |
| **Auth / SSO** | 🟨 | ✅ | ✅ | 🟨 | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Eval harness present** | ✅ | 🟨 | 🟨 | ❌ | 🟨 | 🟨 | 🟨 | ✅ | ❌ | ❌ |
| **Active maintenance (≤12 mo)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |


## Modular by design

Every component in this stack is swappable. Models, rerankers, vector DB, streaming transport, and even the orchestration 
graph are suggestions, not requirements. Treat this repo as a reference implementation you can piece apart: keep what you like, 
replace what you don’t. The docs show one happy path; you can rewire models and services to suit your environment.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Setup from Scratch](#setup-from-scratch)
4. [Configure RAG Ignore](#configure-rag-ignore)
5. [MCP Integration](#mcp-integration)
6. [CLI Chat Interface](#cli-chat-interface)
7. [Evaluation & Testing](#evaluation--testing)
8. [Daily Workflows](#daily-workflows)
9. [Troubleshooting](#troubleshooting)
10. [Model Selection](#model-selection)
11. [Performance & Cost](#performance--cost)

---

## Quick Start

**Prerequisites**
- Python 3.11+
- Docker Engine + Compose
  - macOS (no Docker Desktop): `brew install colima docker` then `colima start`
  - macOS (Docker Desktop): install Docker Desktop and start it
  - Linux: install Docker and Compose via your distro
- Optional local inference: Ollama installed and running (`ollama list`)
  - Linux without Python: `apt update && apt install -y python3 python3-venv python3-pip`

```bash
# 0) Get the code
git clone https://github.com/DMontgomery40/rag-service.git
cd rag-service

# 1) One‑command bring‑up (infra + MCP + API + open GUI)
#    Uses Colima automatically on macOS if Docker isn't running
make dev            # or: bash scripts/dev_up.sh

# 2) One‑command setup (recommended)
#    From THIS folder, pass your repo path/name. If you want to index THIS
#    repo itself, just use "." and a name you like.
bash scripts/setup.sh . rag-service

# 3) Start CLI chat (interactive)
export REPO=rag-service THREAD_ID=my-session
python -m venv .venv && . .venv/bin/activate  # if .venv not present yet
python chat_cli.py

# Optional: manual API bring‑up instead of make dev
make api   # runs: uvicorn serve_rag:app --host 127.0.0.1 --port 8012
curl "http://127.0.0.1:8012/search?q=oauth&repo=rag-service"

# MCP tools quick check (stdio)
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | python mcp_server.py | head -n1
```

### Common setup hiccups (fast fixes)
- Docker not found on macOS: install and start Colima: `brew install colima docker && colima start`. The new `make dev` will auto‑start Colima if available.
- “Permission denied” on scripts: run with an interpreter: `python scripts/quick_setup.py` or `bash scripts/setup.sh`.
- `python: command not found` on Linux: `apt update && apt install -y python3 python3-venv python3-pip`.
- “Is it frozen?”: use streaming (`python chat_cli.py --stream`) or run `bash scripts/setup.sh ...` and watch progress.

### Optional (Additive) Features

- SSE streaming (off by default)
  - Endpoint: `/answer_stream?q=...&repo=...`
  - CLI or UIs can opt-in to streaming via this endpoint; default remains blocking.

### GUI settings (host/port, Docker)
- The HTTP GUI/API is served by `serve_rag.py` (root path returns `gui/index.html`; see serve_rag.py:41-46). Use the GUI’s “Misc” tab to set:
  - `Serve Host` and `Serve Port` (gui/index.html:1471, gui/index.html:1475)
  - `Open Browser on Start` (gui/index.html:1482)
  - `Auto‑start Colima (Docker)` and optional `Colima Profile` (gui/index.html:1489, gui/index.html:1497)
- Click “Apply All Changes” to persist to `.env`, which `scripts/dev_up.sh` reads on next run.
- OAuth bearer (off by default)
  - Enable with `OAUTH_ENABLED=true` and set `OAUTH_TOKEN=...`
  - Applies to `/answer`, `/search`, and `/answer_stream` when enabled.
- Node proxy (HTTP+SSE), optional
  - `docker compose -f docker-compose.services.yml --profile api --profile node up -d`
  - Proxies `/mcp/answer`, `/mcp/search`, `/mcp/answer_stream` to Python API.
- Docker (opt-in)
  - Python API image via `Dockerfile`
  - Node proxy via `Dockerfile.node`
  - Compose file: `docker-compose.services.yml` (profiles: `api`, `mcp-http`, `node`)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  AI Agents (Codex/Claude)   CLI Chat (local)                 CLI Chat (stream) │
└────────────┬───────────────────────┬──────────────┬───────────────────────────┘
             │ MCP stdio            │ MCP HTTP     │ HTTP (SSE)                
             ▼                       ▼              ▼                           
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐ 
│   mcp_server.py     │     │  mcp_server_http.py │     │     serve_rag.py    │ 
│   (stdio mode)      │     │  (HTTP mode)        │     │  (FastAPI /answer*) │ 
└──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘ 
           │                            │                           │            
           └──────────────┬─────────────┴──────────────┬────────────┘            
                          ▼                            ▼                         
                ┌──────────────────┐          ┌──────────────────┐               
                │  langgraph_app   │ ◄────────┤  hybrid_search   │               
                │   (LangGraph)    │          │   (Retrieval)    │               
                └─────────┬────────┘          └─────────┬────────┘               
                          │                             │                          
          ┌───────────────┴──────────────┐    ┌─────────┴────────┐               
          ▼                              ▼    ▼                  ▼               
   ┌──────────────┐               ┌──────────────┐       ┌──────────────┐        
   │   Qdrant     │               │    BM25S     │       │ Local Chunks │        
   │  (vectors)   │               │  (sparse)    │       │    (.jsonl)  │        
   └──────────────┘               └──────────────┘       └──────────────┘        
                          ▲                                                         
                          │                                                         
                  ┌───────┴────────┐                                                
                  │  index_repo.py │                                                
                  │  (indexing)    │                                                
                  └────────────────┘                                                

* /answer* = includes /answer (JSON) and /answer_stream (SSE)
```

### Key Components

| Component | Purpose | File |
|-----------|---------|------|
| **MCP Server (stdio)** | Tool server for local agents | `mcp_server.py` |
| **MCP Server (HTTP)** | Tool server for remote agents | `mcp_server_http.py` |
| **FastAPI** | HTTP REST API (`/health`, `/search`, `/answer`) | `serve_rag.py` |
| **LangGraph** | Iterative retrieval pipeline with Redis checkpoints | `langgraph_app.py` |
| **Hybrid Search** | BM25 + dense + rerank with repo routing | `hybrid_search.py` |
| **Indexer** | Chunks code, builds BM25, embeds, upserts Qdrant | `index_repo.py` |
| **CLI Chat** | Interactive terminal chat with memory | `chat_cli.py` |
| **Eval Harness** | Golden tests with regression tracking | `eval_loop.py` |
| **Cards Builder** | Summarizes chunks into `cards.jsonl` and builds BM25 over cards for high‑level retrieval | `build_cards.py` |
| **Reranker** | Cross‑encoder re‑ranking (Cohere rerank‑3.5 or local), plus filename/path/card/feature bonuses | `rerank.py` |
| **Embedding Cache** | Caches OpenAI embeddings to avoid re‑embedding unchanged chunks | `embed_cache.py` |
| **AST Chunker** | Language‑aware code chunking across ecosystems | `ast_chunker.py` |
| **Filtering** | Centralized file/dir pruning and source gating | `filtering.py` |
| **Generation Shim** | OpenAI Responses/Chat or local Qwen via Ollama with resilient fallbacks | `env_model.py` |

---

## Setup from Scratch

### Phase 1: Infrastructure

Note: This repo already includes `infra/docker-compose.yml` with relative volumes.
Prefer using `bash scripts/up.sh` or `cd infra && docker compose up -d` rather than
hand-writing a compose file.

```bash
# Create directory structure
mkdir -p /path/to/rag-service/{infra,data/qdrant,data/redis}

# Create docker-compose.yml
cat > /path/to/rag-service/infra/docker-compose.yml <<'YAML'
version: "3.8"
services:
  qdrant:
    image: qdrant/qdrant:v1.15.5
    container_name: qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    environment:
      - QDRANT__STORAGE__USE_MMAP=false
      - QDRANT__STORAGE__ON_DISK_PERSISTENCE=true
    volumes:
      - /path/to/rag-service/data/qdrant:/qdrant/storage
  redis:
    image: redis/redis-stack:7.2.0-v10
    container_name: rag-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    environment:
      - REDIS_ARGS=--appendonly yes
    volumes:
      - /path/to/rag-service/data/redis:/data
YAML

# Start services
cd /path/to/rag-service/infra
docker compose up -d

# Verify
curl -s http://127.0.0.1:6333/collections  # Should return {"result":...}
docker exec rag-redis redis-cli ping       # Should return PONG
```

### Phase 2: Python Environment

```bash
cd /path/to/rag-service

# Create venv (if not exists)
python3 -m venv .venv
. .venv/bin/activate

# Install dependencies
pip install -r requirements-rag.txt
pip install -r requirements.txt

# For CLI chat (optional but recommended)
pip install rich

# Verify critical imports
python -c "import langgraph, qdrant_client, bm25s, sentence_transformers; print('✓ OK')"
```

### Phase 3: Environment Variables

Create `.env` file:

```bash
cat > .env <<'EOF'
# Infrastructure
QDRANT_URL=http://127.0.0.1:6333
REDIS_URL=redis://127.0.0.1:6379/0

# RAG Configuration
REPO=repo-a                     # Default repo for operations
MQ_REWRITES=4                   # Multi-query expansion count

# Reranker (default: Cohere with local fallback)
RERANK_BACKEND=cohere           # cohere | hf | local
COHERE_API_KEY=                 # Set this to enable Cohere rerank
COHERE_RERANK_MODEL=rerank-3.5  # or rerank-2.5

# Generation (default: local Qwen 3 via Ollama)
OLLAMA_URL=http://127.0.0.1:11434/api
GEN_MODEL=qwen3-coder:30b       # or qwen2.5-coder:7b for lower RAM

# Optional: OpenAI for generation (alternative to Ollama)
# OPENAI_API_KEY=sk-proj-...
# GEN_MODEL=gpt-4o-mini

# Optional: Embeddings provider
EMBEDDING_TYPE=openai           # openai | local | voyage | gemini
OPENAI_API_KEY=                 # Required for OpenAI embeddings
VOYAGE_API_KEY=                 # Required for Voyage embeddings

# Optional: Netlify multi-site deploys for MCP tool
NETLIFY_DOMAINS=site-a.com,site-b.com

# Optional: MCP integrations
NETLIFY_API_KEY=                # For netlify_deploy tool

# LangChain (optional)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=rag-service
EOF

chmod 600 .env  # Protect secrets
```

### Phase 4: Configure RAG Ignore

**This step is critical** - it prevents indexing noise, vendor code, and build artifacts.

The system has three layers of filtering:

#### 1. Built-in Filtering (`filtering.py`)
Automatically excludes common directories and file types:
- Directories: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, etc.
- File extensions: Only indexes code files (`.py`, `.js`, `.ts`, `.rb`, `.go`, etc.)

#### 2. Project-Specific Excludes (`data/exclude_globs.txt`)

Edit this file to add glob patterns for your repos:

```bash
cd /path/to/rag-service
cat data/exclude_globs.txt

# Add your patterns:
echo "**/my-vendor-dir/**" >> data/exclude_globs.txt
echo "**/*.generated.ts" >> data/exclude_globs.txt
echo "**/migrations/**" >> data/exclude_globs.txt
```

**Common patterns to exclude:**
```bash
# Build artifacts
**/dist/**
**/build/**
**/.next/**

# Generated code
**/*.generated.*
**/*.min.js
**/*.bundle.js

# Large data files
**/*.json.gz
**/fixtures/**
**/test-data/**

# Vendor/dependencies (if not caught by built-in)
**/third_party/**
**/external/**
```

#### 3. Auto-Generate Keywords (Optional)

The `scripts/` folder contains tools to analyze your codebase and generate optimal configurations:

```bash
cd /path/to/rag-service/scripts

# Analyze a repo to find important keywords
python analyze_keywords.py /path/to/your/repo-a

# Enhanced version with more insights
python analyze_keywords_v2.py /path/to/your/repo-a

# Output shows:
# - Most common file types
# - Directory structure
# - Suggested keywords for hybrid_search.py
# - Recommended path boosts
```

**After configuring .ragignore:**

```bash
# Re-index affected repos
REPO=repo-a python index_repo.py
REPO=repo-b python index_repo.py

# Verify collections
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
```

### Phase 5: Index Repositories

```bash
. .venv/bin/activate

# Index first repo (replace with your repo name)
REPO=repo-a python index_repo.py
# This will:
#   - Scan /path/to/your/repo-a (configured in index_repo.py)
#   - Chunk code files (Python, JS, TS, Ruby, Go, etc.)
#   - Build BM25 index
#   - Generate embeddings (OpenAI text-embedding-3-large by default)
#   - Upsert to Qdrant collection: code_chunks_repo-a
#   - Save chunks to: out/repo-a/chunks.jsonl

# Index second repo
REPO=repo-b python index_repo.py
# Same process, separate collection: code_chunks_repo-b

# Verify collections exist
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
# Should show: code_chunks_repo-a, code_chunks_repo-b
```

**Configure repo paths:**

Edit the beginning of `index_repo.py` to set your repo locations:

```python
REPOS = {
    'repo-a': '/path/to/your/first-repo',
    'repo-b': '/path/to/your/second-repo',
}
```

---

## CLI Chat Interface

**Recommended for interactive use** - Terminal chat with conversation memory and rich formatting.

### Quick Start

```bash
. .venv/bin/activate

# Install rich library for terminal UI (if not already installed)
pip install rich

# Start chat
export REPO=repo-a
export THREAD_ID=my-session
python chat_cli.py
```

### Features

- **Conversation Memory**: Redis-backed, persists across sessions
- **Rich Terminal UI**: Markdown rendering, color-coded confidence scores
- **Citation Display**: Shows file paths and rerank scores
- **Repo Switching**: `/repo repo-b` to switch between repos mid-conversation
- **Multiple Sessions**: Use different `THREAD_ID` values for parallel conversations

### Commands

| Command | Description |
|---------|-------------|
| `your question` | Ask directly |
| `/repo <name>` | Switch repository (e.g., `/repo repo-b`) |
| `/clear` | Clear conversation history (new thread) |
| `/help` | Show available commands |
| `/exit`, `/quit` | Exit chat |

### Example Session

```
repo-a > Where is OAuth token validation handled?

[Claude retrieves and displays answer with citations]

📄 Top Sources:
  1. auth/oauth.py:42-67 (score: 0.85)
  2. middleware/token.py:89-120 (score: 0.78)

repo-a > /repo repo-b
✓ Switched to repo: repo-b

repo-b > How do we handle webhook retries?
```

See **[docs/CLI_CHAT.md](docs/CLI_CHAT.md)** for detailed usage.

---

## MCP Integration

The MCP (Model Context Protocol) server exposes RAG tools that AI agents can call directly.

### Server Modes

The system supports **three MCP modes**:

#### 1. **stdio Mode** (Default - for local agents)
- File: `mcp_server.py`
- Protocol: JSON-RPC over stdin/stdout
- Use for: Codex CLI, Claude Code (desktop app)

#### 2. **HTTP Mode** (for remote agents/platforms)
- File: `mcp_server_http.py`
- Protocol: HTTP at `/mcp` endpoint
- Use for: Remote evals, cloud platforms, web agents

#### 3. **HTTPS Mode** (HTTP + reverse proxy)
- Setup: Caddy/Nginx in front of HTTP mode
- Tunneling: ngrok or Cloudflare Tunnel support (coming soon)
- Use for: Production deployments, secure remote access

See **[docs/REMOTE_MCP.md](docs/REMOTE_MCP.md)** for HTTP/HTTPS setup.

### Tools Available

The MCP server exposes 4 tools:

#### 1. `rag_answer(repo, question)`
Full LangGraph pipeline (retrieval → generation)

**Returns:**
```json
{
  "answer": "[repo: repo-a]\nOAuth tokens are validated in...",
  "citations": [
    "auth/oauth.py:42-67",
    "middleware/token.py:89-120"
  ],
  "repo": "repo-a",
  "confidence": 0.78
}
```

#### 2. `rag_search(repo, question, top_k=10)`
Retrieval-only (no generation, faster for debugging)

**Returns:**
```json
{
  "results": [
    {
      "file_path": "controllers/api_controller.rb",
      "start_line": 45,
      "end_line": 89,
      "language": "ruby",
      "rerank_score": 0.82,
      "repo": "repo-b"
    }
  ],
  "repo": "repo-b",
  "count": 5
}
```

#### 3. `netlify_deploy(domain)`
Trigger Netlify builds (requires `NETLIFY_API_KEY`)

**Arguments:**
- `domain`: Site to deploy (e.g., `"site-a.com"`, or `"both"` to deploy all in `NETLIFY_DOMAINS`)

**Returns:**
```json
{
  "results": [
    {
      "domain": "site-a.com",
      "status": "triggered",
      "site_id": "abc123",
      "build_id": "def456"
    }
  ]
}
```

#### 4. `web_get(url, max_bytes=20000)`
HTTP GET for allowlisted documentation domains

**Allowlisted hosts:**
- `openai.com`
- `platform.openai.com`
- `github.com`
- `openai.github.io`

**Returns:**
```json
{
  "url": "https://github.com/openai/codex",
  "status": 200,
  "length": 12345,
  "clipped": true,
  "content_preview": "..."
}
```

### Connecting to Claude Code

Claude Code supports MCP servers natively via JSON configuration.

#### Step 1: Locate Config File

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Step 2: Add Server Config

Edit the config file (create if it doesn't exist):

```json
{
  "mcpServers": {
    "rag-service": {
      "command": "/path/to/rag-service/.venv/bin/python",
      "args": ["/path/to/rag-service/mcp_server.py"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-...",
        "OLLAMA_URL": "http://127.0.0.1:11434/api",
        "GEN_MODEL": "qwen3-coder:30b",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "REDIS_URL": "redis://127.0.0.1:6379/0"
      }
    }
  }
}
```

**Important:**
- Use **absolute paths** (no `~`)
- Include API keys if using OpenAI embeddings
- Include Ollama config if using local generation
- Restart Claude Code after editing

#### Step 3: Test in Claude Code

1. Open Claude Code
2. Start a new conversation
3. Look for MCP tools indicator
4. Test by asking:
   ```
   Use rag_search to find code related to "authentication" in repo-a
   ```

Claude Code will call the tool and display results.

### Connecting to Codex

Codex CLI has built-in MCP support via `codex mcp` commands.

#### Step 1: Install Codex CLI

```bash
# Via Homebrew (macOS)
brew install openai/tap/codex

# Via npm (all platforms)
npm install -g @openai/codex

# Verify
codex --version
```

#### Step 2: Register MCP Server

```bash
codex mcp add rag-service -- \
  /path/to/rag-service/.venv/bin/python \
  /path/to/rag-service/mcp_server.py
```

This adds the server to `~/.codex/config.toml`.

#### Step 3: Verify Registration

```bash
codex mcp list
# Should show:
# Name         Command                                    Args
# rag-service  /path/to/.venv/bin/python                  /path/to/mcp_server.py
```

#### Step 4: Test in Codex

```bash
codex
```

Then try:
```
User: Use rag_search to find code about "API endpoints" in repo-b

User: Use rag_answer to explain how authentication works in repo-a
```

### MCP Example Usage

**Example 1: Debug retrieval**
```
User: Use rag.search to see what code comes up for "webhook handling" in repo-b,
      show me the top 5 results
```

**Example 2: Get full answer**
```
User: Use rag.answer to explain how we validate OAuth tokens in repo-a
```

**Example 3: Trigger deployment**
```
User: Use netlify_deploy to rebuild site-a.com
```

**Example 4: Fetch documentation**
```
User: Use web_get to fetch https://platform.openai.com/docs/models
```

### MCP Server Management

```bash
# List all MCP servers
codex mcp list

# Remove a server
codex mcp remove rag-service

# Re-add with updated path
codex mcp add rag-service -- /path/to/python /path/to/mcp_server.py

# Test manually (stdio mode)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py
```

---

## Evaluation & Testing

### Quick Eval Run

```bash
. .venv/bin/activate

# Run all golden tests once
python eval_loop.py

# Output:
# ===========================
# EVAL RESULTS
# ===========================
# Total questions: 10
# Top-1 accuracy:  70.0% (7/10)
# Top-5 accuracy:  90.0% (9/10)
# Duration:        12.4s
```

### Creating Golden Tests

Golden tests are in `golden.json`:

```json
[
  {
    "q": "Where is OAuth token validated?",
    "repo": "repo-a",
    "expect_paths": ["auth", "oauth", "token", "validation"]
  },
  {
    "q": "How do we handle webhook retries?",
    "repo": "repo-b",
    "expect_paths": ["webhook", "retry", "queue", "handler"]
  }
]
```

**Substring matching**: Any result containing these strings counts as a hit.

### Advanced Eval Features

#### Save Baseline

```bash
python eval_loop.py --baseline
# ✓ Baseline saved to eval_baseline.json
```

#### Compare vs Baseline (Regression Detection)

```bash
python eval_loop.py --compare

# Shows which questions regressed after code changes
```

#### Watch Mode (Continuous Eval)

```bash
python eval_loop.py --watch

# Auto-runs eval when files change
# Useful during active development
```

#### JSON Output (for CI/CD)

```bash
python eval_loop.py --json > results.json
```

---

## Daily Workflows

### Morning Startup

```bash
# Use the helper script (starts infra + MCP)
cd /path/to/rag-service
bash scripts/up.sh

# Or manually:
cd /path/to/rag-service/infra
docker compose up -d

# Start CLI chat
. .venv/bin/activate
export REPO=repo-a THREAD_ID=work-$(date +%Y%m%d)
python chat_cli.py
```

### After Code Changes (Re-index)

```bash
. .venv/bin/activate

# Re-index affected repo
REPO=repo-a python index_repo.py

# Run eval to check for regressions
python eval_loop.py --compare
```

**When to re-index:**
- After merging PRs
- When adding/removing files
- After significant refactors
- Daily/nightly via cron (optional)

### Cross-Branch Indexing (Shared)

Use a single shared index that works across branches to avoid stale/missing results:

```bash
# One-time build (BM25-only; fast; no APIs)
. .venv/bin/activate
REPO=agro OUT_DIR_BASE=./out.noindex-shared EMBEDDING_TYPE=local SKIP_DENSE=1 \
  python index_repo.py

# Ensure environment for tools and MCP
source scripts/select_index.sh shared  # sets OUT_DIR_BASE & COLLECTION_NAME

# Bring infra + MCP up with shared profile
bash scripts/up.sh && bash scripts/status.sh
```

GUI path (accessibility):
- Open the GUI at `/` (FastAPI serve) → Tab “Infrastructure”.
- Set `Active Repository`, `Out Dir Base=./out.noindex-shared`, and optionally `Collection Name`.
- Click “Apply All Changes” to persist to `.env` and `repos.json`.

### Debugging a Bad Answer

```bash
# 1. Use rag_search to see what was retrieved
python -c "
from hybrid_search import search_routed_multi
results = search_routed_multi('your question', repo_override='repo-a', final_k=10)
for r in results[:5]:
    print(f\"{r['rerank_score']:.3f} {r['file_path']}:{r['start_line']}\")
"

# 2. Check if expected file is in index
grep "path/to/file.py" out/repo-a/chunks.jsonl

# 3. If missing, check if .ragignore is excluding it
cat data/exclude_globs.txt
```

---

## Troubleshooting

### Infrastructure Issues

**Qdrant connection refused:**
```bash
# Check status
docker ps | grep qdrant

# Restart
docker restart qdrant

# Verify
curl -s http://127.0.0.1:6333/collections
```

**Redis connection fails:**
```bash
# Test
docker exec rag-redis redis-cli ping  # Should return PONG

# Restart
docker restart rag-redis
```

**Collections missing:**
```bash
# List collections
curl -s http://127.0.0.1:6333/collections | jq

# Re-index if missing
REPO=repo-a python index_repo.py
```

### Indexing Issues

**Files not being indexed:**
1. Check `.ragignore` patterns:
   ```bash
   cat data/exclude_globs.txt
   ```

2. Verify file extension is supported:
   ```bash
   grep "LANG_MAP" ast_chunker.py
   # Supported: .py, .js, .ts, .tsx, .rb, .go, .java, .cpp, .c, etc.
   ```

3. Check if directory is being pruned:
   ```bash
   grep "PRUNE_DIRS" filtering.py
   ```

**OpenAI rate limits (429 errors):**
- Indexing uses batched embeddings (64 per request)
- Wait between repos if hitting limits
- Consider using local embeddings (see Model Selection)

### MCP Issues

**Codex doesn't see tools:**
```bash
# Check registration
codex mcp list

# Re-register
codex mcp add rag-service -- /path/to/python /path/to/mcp_server.py

# Test manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py
```

**Claude Code doesn't see tools:**
1. Check config file:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```
2. Verify absolute paths (no `~`)
3. Restart Claude Code completely

**"Graph not initialized" error:**
```bash
# Test Redis connection
docker exec rag-redis redis-cli ping

# Test graph initialization
python -c "from langgraph_app import build_graph; build_graph(); print('✓ OK')"
```

**MCP rag_search returns no results (count: 0):**
1. Verify the index exists under the shared profile:
   ```bash
   ls -lh out.noindex-shared/agro/chunks.jsonl
   ```
2. Ensure the environment MCP sees includes the shared index path:
   - EITHER run `source scripts/select_index.sh shared` before starting MCP
   - OR set in GUI → Infrastructure tab → `Out Dir Base=./out.noindex-shared` → “Apply All Changes”
3. Restart MCP: `bash scripts/up.sh` (this now sources the shared profile automatically).
4. Retest search quickly:
   ```bash
   . .venv/bin/activate && OUT_DIR_BASE=./out.noindex-shared \
     python - <<'PY'
   from hybrid_search import search_routed_multi
   print(len(search_routed_multi('Where is OAuth validated', repo_override='agro', m=2, final_k=5)))
   PY
   ```
5. If empty and chunks missing, re-index:
   ```bash
   . .venv/bin/activate && REPO=agro OUT_DIR_BASE=./out.noindex-shared EMBEDDING_TYPE=local SKIP_DENSE=1 \
     python index_repo.py
   ```

### Retrieval Quality Issues

**Low accuracy / wrong results:**

1. **Check index freshness:**
   ```bash
   ls -lh out/repo-a/chunks.jsonl out/repo-b/chunks.jsonl
   # If old, re-index
   ```

2. **Run eval:**
   ```bash
   python eval_loop.py
   ```

3. **Inspect retrieved docs:**
   ```bash
   python -c "
   from hybrid_search import search_routed_multi
   docs = search_routed_multi('your query', repo_override='repo-a', final_k=10)
   for d in docs[:5]:
       print(f\"{d['rerank_score']:.3f} {d['file_path']}\")
   "
   ```

4. **Adjust parameters** (see [Advanced Configuration](#advanced-configuration) section)

### Ollama Issues (Apple Silicon)

**High GPU usage / thermal load:**

Both MLX and Ollama use GPU (Metal) on Apple Silicon for LLM inference, not the Neural Engine (ANE). This causes:
- High GPU utilization (often maxing out)
- Heat generation and fan noise
- Note: ANE is not used for large language models - it's for smaller, CoreML-optimized models

**Performance**: MLX and Ollama have similar thermal profiles as both use Metal GPU. MLX may have better memory efficiency due to tighter Apple Silicon integration.

**Ollama keeps restarting after kill:**

If `pkill -9 ollama` or `killall -9 ollama` results in Ollama immediately respawning:

```bash
# Root cause: Homebrew's launchd service with KeepAlive=true

# Proper fix: Stop the service
brew services stop ollama

# Verify it's stopped
ps aux | grep ollama  # Should show nothing
pgrep ollama          # Should return empty

# Check launchd status
launchctl list | grep ollama  # Should show nothing after stop
```

**Why this happens:**
- Homebrew installs Ollama as a background service (launchd)
- The service is configured with `KeepAlive=true`
- When killed, launchd immediately restarts it
- `brew services stop` properly unloads the service

**Alternative**: If you still want to use Ollama occasionally:
```bash
# Stop the background service permanently
brew services stop ollama

# Run Ollama manually only when needed
ollama serve  # Run in foreground, Ctrl+C to stop
```

---

## Model Selection

The RAG service defaults to:
- **Generation (Apple Silicon)**: MLX with Qwen3-Coder-30B-A3B-Instruct-4bit (`ENRICH_BACKEND=mlx`)
  - **Why MLX**: Uses Metal GPU acceleration optimized for Apple Silicon unified memory architecture
  - **vs Ollama**: Better memory efficiency on Apple Silicon, though both use GPU (not ANE)
- **Generation (Fallback/Other Platforms)**: Ollama with Qwen 3 (`GEN_MODEL=qwen3-coder:30b`)
- **Embeddings**: OpenAI `text-embedding-3-large` (auto-fallback to local BGE if unavailable)
- **Reranking**: Local cross-encoder (set `RERANK_BACKEND=cohere` + `COHERE_API_KEY` to use Cohere rerank-3.5)

### Quick Alternatives

| Goal | Embedding | Generation | Cost |
|------|-----------|------------|------|
| **Apple Silicon (M1-M4)** | nomic-embed-text | MLX + Qwen3-30B-A3B-4bit | Free |
| **Best Performance** | Voyage voyage-3-large | MLX + Qwen3-30B (Mac) | $ |
| **Lowest Cost** | Google Gemini (free) | Gemini 2.5 Flash | Free |
| **Fully Local** | nomic-embed-text | Qwen2.5-Coder 7B | Free |
| **Privacy First** | BGE-M3 (local) | DeepSeek-Coder | Free |

### Self-Hosted Setup

**For Mac (M1/M2/M3/M4) - RECOMMENDED:**
```bash
# Install MLX (Metal-optimized for Apple Silicon GPU)
pip install mlx mlx-lm

# Download Qwen3 model (one-time, ~17GB)
python -c "from mlx_lm import load; load('mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit')"

# Update .env to use MLX
echo "ENRICH_BACKEND=mlx" >> .env
echo "GEN_MODEL=mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit" >> .env

# Alternative: Ollama (also GPU-based, similar performance)
# brew install ollama
# ollama pull qwen3-coder:30b  # 32GB+ RAM required
```

**For NVIDIA GPU (16GB+ VRAM):**
- Use Ollama or vLLM
- Models: Qwen2.5-Coder 32B, DeepSeek-Coder V2

### Detailed Guides

See **[docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md)** for:
- Current pricing (as of Oct 2025)
- Hardware requirements
- Performance benchmarks
- Migration guides
- Complete model comparison

**Note**: Model rankings change frequently. Always check current benchmarks:
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Embedding models
- [OpenLLM Leaderboard](https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard) - Generation models

---

## Advanced Configuration

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | For OpenAI embeddings/generation |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api` | Ollama API endpoint |
| `GEN_MODEL` | `qwen3-coder:30b` | Generation model |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant server |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection |
| `REPO` | `repo-a` | Active repo name |
| `MQ_REWRITES` | `4` | Multi-query expansion count |
| `RERANK_BACKEND` | `cohere` | `cohere` \| `hf` \| `local` |
| `COHERE_API_KEY` | — | For Cohere reranking |
| `EMBEDDING_TYPE` | `openai` | `openai` \| `voyage` \| `local` \| `gemini` |
| `NETLIFY_API_KEY` | — | For netlify_deploy tool |

### Tuning Retrieval

Edit `hybrid_search.py` to adjust:
- Layer bonuses (boost specific file types)
- Path bonuses (boost specific directories)
- Candidate counts (`topk_dense`, `topk_sparse`)

Edit `langgraph_app.py` to adjust:
- Confidence thresholds
- Multi-query rewrite count

### Adding New Languages

Edit `ast_chunker.py`:

```python
LANG_MAP = {
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",  # ← Add Rust
    # ... add more
}

FUNC_NODES = {
    "rust": {"fn_item", "impl_item"},  # ← Define AST nodes
    # ...
}
```

Then re-index.

---

## File Reference

### Core Files

| File | Purpose |
|------|---------|
| `mcp_server.py` | **MCP stdio server for local agents** |
| `mcp_server_http.py` | **MCP HTTP server for remote agents** |
| `chat_cli.py` | **Interactive CLI chat with memory** |
| `serve_rag.py` | FastAPI HTTP server |
| `langgraph_app.py` | LangGraph retrieval pipeline |
| `hybrid_search.py` | Hybrid search (BM25 + dense + rerank) |
| `index_repo.py` | Indexing script |
| `eval_loop.py` | Eval harness with regression tracking |

### Configuration

| File | Purpose |
|------|---------|
| `.env` | Environment variables (API keys, URLs) |
| `golden.json` | Golden test questions |
| `data/exclude_globs.txt` | **.ragignore patterns** |
| `filtering.py` | Built-in directory/extension filters |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/up.sh` | **Start infra + MCP (recommended)** |
| `scripts/down.sh` | Stop all services |
| `scripts/status.sh` | Check service status |
| `scripts/analyze_keywords.py` | **Generate keywords for your repos** |
| `scripts/analyze_keywords_v2.py` | Enhanced keyword analysis |

---

## Quick Command Reference

```bash
# === Infrastructure ===
bash scripts/up.sh                      # Start everything (recommended)
bash scripts/status.sh                  # Check status
bash scripts/down.sh                    # Stop everything

# === Indexing ===
. .venv/bin/activate
REPO=repo-a python index_repo.py
REPO=repo-b python index_repo.py

# === CLI Chat (Recommended) ===
export REPO=repo-a THREAD_ID=work-session
python chat_cli.py

# === API Server (Optional) ===
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# === Eval ===
python eval_loop.py                     # Run tests
python eval_loop.py --baseline          # Save baseline
python eval_loop.py --compare           # Check regressions
python eval_loop.py --watch             # Watch mode

# === MCP ===
codex mcp list                          # List servers
codex mcp add rag-service -- .venv/bin/python mcp_server.py
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py        # Test manually

# === Keyword Generation ===
cd scripts
python analyze_keywords.py /path/to/repo-a
python analyze_keywords_v2.py /path/to/repo-a
```

---

## Claude Code Alone vs Claude Code + RAG

**RAG saves 91% tokens = 11x more queries before hitting your Claude rate limits.**

**Tested:** Oct 8, 2025 | **Claude:** Sonnet 4.5 on $200/mo Pro

| Approach | Tokens/Query | Queries/Week (Before Rate Limit) | Latency | Quality |
|----------|--------------|----------------------------------|---------|---------|
| **Claude Code Alone** | 12,700 | 100 (Sonnet) / 23 (Opus) | 5-10s | Excellent |
| **Claude Code + RAG** | 1,141 | **1,110 (Sonnet) / 263 (Opus)** | 2.9s | Excellent |
| **DIFFERENCE** | **-91%** | **+1,010% / +1,043%** | **2-3x faster** | Same |

**Why this matters:**
- ✅ **11x more queries** before hitting weekly rate limits
- ✅ **2-3x faster** (no file reading overhead)
- ✅ **Same quality** (excellent answers from both)
- ✅ **Never get rate limited** on heavy coding days (with Opus especially)

**The problem:** Claude Pro has weekly rate limits (~1.27M tokens/week for Sonnet, ~300K for Opus). Without RAG, you can hit those limits in a single day with Opus.

**The solution:** RAG reduces tokens by 91%, so you can code all week without hitting limits.

**📊 [See complete analysis](docs/PERFORMANCE_AND_COST.md)** | **[Contributing benchmarks](docs/CONTRIBUTING.md)**

---

## Additional Documentation

📂 **See [docs/README.md](docs/README.md) for complete documentation index**

- **[Performance & Cost Analysis](docs/PERFORMANCE_AND_COST.md)** - Real measurements & ROI calculator
- **[MCP Integration Guide](docs/MCP_README.md)** - Complete MCP documentation
- **[MCP Quick Start](docs/QUICKSTART_MCP.md)** - Fast reference
- **[Remote MCP Setup](docs/REMOTE_MCP.md)** - HTTP/HTTPS/tunneling
- **[CLI Chat Guide](docs/CLI_CHAT.md)** - Interactive terminal chat
- **[Model Recommendations](docs/MODEL_RECOMMENDATIONS.md)** - Current pricing & benchmarks
- **[Model Comparison](docs/GEN_MODEL_COMPARISON.md)** - Qwen vs OpenAI

---

**Version:** 2.0.0  
**Last Updated:** October 8, 2025

---

## Support & References

- **MCP Specification:** https://modelcontextprotocol.io/
- **Codex CLI:** https://github.com/openai/codex
- **LangGraph:** https://python.langchain.com/docs/langgraph
- **Qdrant:** https://qdrant.tech/documentation/
- **MTEB Leaderboard:** https://huggingface.co/spaces/mteb/leaderboard

## RAG for Code — Comparative Matrix

*Legend:* ✅ = present/native · 🟨 = partial / configurable / undocumented · ❌ = absent

| Feature ↓ · Tool → | **AGRO (rag-service)** | **Sourcegraph Cody** | **GitHub Copilot Ent.** | **Cursor** | **Codeium / Windsurf** | **Tabnine** | **Continue.dev (OSS)** | **LlamaIndex – Code (OSS)** | **Claude Code** | **JetBrains AI Assistant** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **OSS code available** | 🟨 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Commercial plan exists** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | 🟨 | ✅ | ✅ |
| **Dense embeddings** | ✅ | ❌ | 🟨 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ |
| **Hybrid (sparse + dense)** | ✅ | ❌ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 |
| **AST / code-graph chunking** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 🟨 | ✅ | ❌ | ✅ |
| **Reranker present** | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | ✅ | ✅ | 🟨 | 🟨 |
| **Incremental / streaming re-index** | ✅ | 🟨 | 🟨 | ✅ | ✅ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 |
| **Symbol graph / LSP integration** | ❌ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | ❌ | ✅ |
| **Multi-language** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cross-file reasoning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ | ✅ |
| **Citations include path+line** | ✅ | ✅ | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 | 🟨 |
| **Vector DB explicitly noted** | ✅ | ❌ | 🟨 | ✅ | 🟨 | ✅ | 🟨 | ✅ | ❌ | 🟨 |
| **IDE / CLI available** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ | ✅ |
| **MCP / API connectors** | ✅ | ✅ | 🟨 | ✅ | ✅ | 🟨 | ✅ | ❌ | ✅ | ✅ |
| **GitHub / CI hooks** | 🟨 | ✅ | ✅ | 🟨 | ✅ | 🟨 | ✅ | 🟨 | 🟨 | 🟨 |
| **Local-first option** | ✅ | ✅ | ❌ | 🟨 | ✅ | ✅ | ✅ | ✅ | 🟨 | ❌ |
| **Telemetry / data controls** | 🟨 | 🟨 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟨 | ✅ |
| **Auth / SSO** | 🟨 | ✅ | ✅ | 🟨 | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Eval harness present** | ✅ | 🟨 | 🟨 | ❌ | 🟨 | 🟨 | 🟨 | ✅ | ❌ | ❌ |
| **Active maintenance (≤12 mo)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
