# RAG Service - Complete Guide

**Strict per-repo RAG for Vivified & Faxbot codebases with MCP integration for AI agents**

👉 **New here?** See [START_HERE.md](START_HERE.md) for quick navigation
📂 **Extended docs**: See [docs/](docs/) for specialized guides (MCP, models, chat CLI)

---

This is a production RAG (Retrieval-Augmented Generation) service that:
- Maintains **strict separation** between Vivified and Faxbot repos (never mixes them)
- Uses **hybrid search** (BM25 + dense embeddings + cross-encoder reranking)
- Provides **MCP tools** for Codex and Claude Code integration
- Includes **eval harness** for measuring and tracking retrieval quality
- Supports **multi-query expansion** and **local code hydration** for performance

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Setup from Scratch](#setup-from-scratch)
4. [MCP Integration](#mcp-integration)
   - [Connecting to Claude Code](#connecting-to-claude-code)
   - [Connecting to Codex](#connecting-to-codex)
5. [Evaluation & Testing](#evaluation--testing)
6. [Daily Workflows](#daily-workflows)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)

---

## Quick Start

**Prerequisites**: Docker Compose, Python 3.11+, OpenAI API key

```bash
# 1. Start infrastructure (Qdrant + Redis)
cd /Users/davidmontgomery/faxbot_folder/infra
docker compose up -d

# 2. Activate venv and verify deps
cd /Users/davidmontgomery/faxbot_folder/rag-service
. .venv/bin/activate
python -c "import fastapi, qdrant_client, bm25s; print('✓ All deps OK')"

# 3. Index repos (run both)
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py

# 4. Run the API server
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# 5. Test it
curl "http://localhost:8012/answer?q=Where%20is%20OAuth%20validated&repo=vivified"
```

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    AI Agents (Codex/Claude Code)          │
└───────────────────────┬───────────────────────────────────┘
                        │ MCP (stdio)
                        ▼
┌───────────────────────────────────────────────────────────┐
│                    mcp_server.py                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  rag_answer(repo, question) → answer + citations    │  │
│  │  rag_search(repo, question, top_k) → retrieval only │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────┬───────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ serve_rag.py │ │langgraph_app │ │hybrid_search │
│  (FastAPI)   │ │  (LangGraph) │ │  (Retrieval) │
└──────────────┘ └──────────────┘ └──────┬───────┘
                                          │
        ┌─────────────────────────────────┼──────────────────┐
        ▼                                 ▼                  ▼
┌──────────────┐                  ┌──────────────┐  ┌──────────────┐
│   Qdrant     │                  │    BM25S     │  │ Local Chunks │
│  (vectors)   │                  │  (sparse)    │  │    (.jsonl)  │
└──────────────┘                  └──────────────┘  └──────────────┘
        │                                 │                  │
        └─────────────────────────────────┴──────────────────┘
                            ▲
                            │
                    ┌───────┴────────┐
                    │  index_repo.py │
                    │  (indexing)    │
                    └────────────────┘
```

### Key Components

| Component | Purpose | File |
|-----------|---------|------|
| **MCP Server** | Stdio-based tool server for agents | `mcp_server.py` |
| **FastAPI** | HTTP REST API (`/health`, `/answer`) | `serve_rag.py` |
| **LangGraph** | Iterative retrieval pipeline with Redis checkpoints | `langgraph_app.py` |
| **Hybrid Search** | BM25 + dense + rerank with repo routing | `hybrid_search.py` |
| **Indexer** | Chunks code, builds BM25, embeds, upserts Qdrant | `index_repo.py` |
| **Eval Harness** | Golden tests with regression tracking | `eval_loop.py`, `eval_rag.py` |
| **Cards Builder** | Code summaries for better retrieval | `build_cards.py` |

---

## Setup from Scratch

### Phase 1: Infrastructure

```bash
# Create directory structure
mkdir -p /Users/davidmontgomery/faxbot_folder/{infra,data/qdrant,data/redis}

# Create docker-compose.yml
cat > /Users/davidmontgomery/faxbot_folder/infra/docker-compose.yml <<'YAML'
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
      - /Users/davidmontgomery/faxbot_folder/data/qdrant:/qdrant/storage
  redis:
    image: redis/redis-stack:7.2.0-v10
    container_name: rag-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    environment:
      - REDIS_ARGS=--appendonly yes
    volumes:
      - /Users/davidmontgomery/faxbot_folder/data/redis:/data
YAML

# Start services
cd /Users/davidmontgomery/faxbot_folder/infra
docker compose up -d

# Verify
curl -s http://127.0.0.1:6333/collections  # Should return {"result":...}
docker exec rag-redis redis-cli ping       # Should return PONG
```

### Phase 2: Python Environment

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service

# Create venv (if not exists)
python3 -m venv .venv
. .venv/bin/activate

# Install dependencies (already in requirements.txt)
pip install -r requirements.txt

# Verify critical imports
python -c "import langgraph, qdrant_client, bm25s, sentence_transformers; print('✓ OK')"
```

### Phase 3: Environment Variables

Create `.env` file:

```bash
cat > .env <<'EOF'
# Required
OPENAI_API_KEY=sk-proj-...

# Infrastructure
QDRANT_URL=http://127.0.0.1:6333
REDIS_URL=redis://127.0.0.1:6379/0

# RAG Configuration
REPO=vivified
MQ_REWRITES=4
RERANKER_MODEL=BAAI/bge-reranker-v2-m3

# Optional: Faxbot path boosts (comma-separated)
FAXBOT_PATH_BOOSTS=app/,lib/,config/,scripts/,server/,api/

# LangChain (optional)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=faxbot-rag
EOF

chmod 600 .env  # Protect secrets
```

### Phase 4: Index Repositories

```bash
. .venv/bin/activate

# Index Vivified (healthcare app)
REPO=vivified python index_repo.py
# This will:
#   - Scan /Users/davidmontgomery/faxbot_folder/vivified
#   - Chunk code files (Python, JS, TS, etc.)
#   - Build BM25 index
#   - Generate OpenAI embeddings (text-embedding-3-large)
#   - Upsert to Qdrant collection: code_chunks_vivified
#   - Save chunks to: out/vivified/chunks.jsonl

# Index Faxbot (Rails fax app)
REPO=faxbot python index_repo.py
# Same process, separate collection: code_chunks_faxbot

# Verify collections exist
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
# Should show: code_chunks_vivified, code_chunks_faxbot
```

### Phase 5: Test the API

```bash
# Start the API server (in one terminal)
. .venv/bin/activate
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# Test (in another terminal)
# Health check
curl -s http://localhost:8012/health | jq

# Ask a question (Vivified)
curl -s "http://localhost:8012/answer?q=Where%20is%20OAuth%20token%20validated&repo=vivified" | jq

# Ask a question (Faxbot)
curl -s "http://localhost:8012/answer?q=How%20do%20we%20handle%20inbound%20faxes&repo=faxbot" | jq
```

---

## MCP Integration

The MCP (Model Context Protocol) server exposes RAG tools that AI agents can call directly.

### Tools Available

1. **`rag_answer(repo, question)`**
   - Full LangGraph pipeline (retrieval → generation)
   - Returns: `{answer, citations, repo, confidence}`
   - Use when you want a complete answer with sources

2. **`rag_search(repo, question, top_k=10)`**
   - Retrieval-only (no generation)
   - Returns: `{results: [{file_path, start_line, end_line, rerank_score}], repo, count}`
   - Use for debugging retrieval or when you just need locations

### Connecting to Claude Code

Claude Code supports MCP servers natively. You need to add the server to Claude Code's configuration.

#### Step 1: Locate Claude Code MCP Config

Claude Code stores MCP configuration in:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

#### Step 2: Add the MCP Server

Edit the config file (create if it doesn't exist):

```json
{
  "mcpServers": {
    "faxbot-rag": {
      "command": "/Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python",
      "args": ["/Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-...",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "REDIS_URL": "redis://127.0.0.1:6379/0"
      }
    }
  }
}
```

**Important Notes:**
- Use **absolute paths** for command and args
- Include environment variables (OPENAI_API_KEY, etc.)
- Restart Claude Code after editing

#### Step 3: Verify in Claude Code

1. Open Claude Code
2. Start a new conversation
3. Look for the MCP indicator (usually in the UI or when listing available tools)
4. Test by asking:
   ```
   Use rag_search to find code related to "OAuth validation" in vivified
   ```

Claude Code should call the tool and display results.

#### Step 4: Example Usage in Claude Code

**Example 1: Get a full answer**
```
User: Use rag.answer to explain how we validate OAuth tokens in the vivified repo

Claude Code will:
  1. Call: rag.answer(repo="vivified", question="How do we validate OAuth tokens?")
  2. Receive answer with citations
  3. Display the answer and cite file locations
```

**Example 2: Debug retrieval**
```
User: Use rag.search to see what code comes up for "inbound fax processing" in faxbot,
      show me the top 5 results

Claude Code will:
  1. Call: rag.search(repo="faxbot", question="inbound fax processing", top_k=5)
  2. Show you the 5 most relevant code locations with scores
```

### Connecting to Codex

Codex CLI has built-in MCP support via `codex mcp` commands.

#### Step 1: Install Codex CLI

```bash
# Via Homebrew (macOS)
brew install openai/tap/codex

# Via npm (all platforms)
npm install -g @openai/codex

# Verify installation
codex --version
```

#### Step 2: Register the MCP Server

```bash
codex mcp add faxbot-rag -- \
  /Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python \
  /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py
```

This adds the server to `~/.codex/config.toml`:

```toml
[[mcp.servers]]
name = "faxbot-rag"
command = "/Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python"
args = ["/Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py"]
```

#### Step 3: Verify Registration

```bash
codex mcp list
# Should show:
# Name        Command                                                            Args
# faxbot-rag  /Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python  /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py
```

#### Step 4: Test in Codex

Start a Codex session:

```bash
codex
```

Then try:
```
User: Use the rag.search tool to find code about "provider setup" in vivified

User: Use rag.answer to tell me how authentication works in the faxbot repo
```

Codex will automatically discover and call the registered tools.

### MCP Server Management

```bash
# List all MCP servers
codex mcp list

# Remove a server
codex mcp remove faxbot-rag

# Re-add with updated path
codex mcp add faxbot-rag -- /path/to/python /path/to/mcp_server.py

# Test the server manually (stdio mode)
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
# Timestamp:       2025-10-07 14:23:10
```

### Creating & Managing Golden Tests

Golden tests are in `golden.json`:

```json
[
  {
    "q": "Where is OAuth token validated?",
    "repo": "vivified",
    "expect_paths": ["identity", "auth", "oauth", "token"]
  },
  {
    "q": "How do we handle inbound faxes?",
    "repo": "faxbot",
    "expect_paths": ["app/", "fax", "inbound", "receive"]
  }
]
```

**How to add a new test:**

1. **Identify a question** - Pick a real question you'd ask about your codebase
2. **Determine the repo** - "vivified" or "faxbot"
3. **Find expected paths** - What file paths should appear in results?
   - Use **substring matching** - any result containing these strings counts as a hit
   - Multiple strings = OR logic (any one match counts)
4. **Add to golden.json**:

```json
{
  "q": "Where do we mask PHI in diagnostic events?",
  "repo": "vivified",
  "expect_paths": ["diagnostic", "phi", "mask", "event"]
}
```

5. **Test immediately**:

```bash
python eval_loop.py
# New question will be included in the run
```

### Advanced Eval Features

#### Save a Baseline

After indexing or making retrieval changes, save current performance as baseline:

```bash
python eval_loop.py --baseline
# ✓ Baseline saved to eval_baseline.json
```

#### Compare vs Baseline (Regression Detection)

After making code changes:

```bash
python eval_loop.py --compare

# Output:
# ============================================================
# REGRESSION CHECK: Current vs Baseline
# ============================================================
#
# Top-1 Accuracy:
#   Baseline: 0.700
#   Current:  0.650
#   Delta:    -0.050 ✗
#
# Top-5 Accuracy:
#   Baseline: 0.900
#   Current:  0.900
#   Delta:    +0.000 ✓
#
# ⚠ REGRESSIONS (1 questions):
#   [3] vivified: Where is ProviderSetupWizard rendered?
#
# ✗ Regressions detected!
```

This tells you exactly which questions got worse.

#### Watch Mode (Continuous Eval)

Monitor files and auto-run eval on changes:

```bash
python eval_loop.py --watch

# ⏱ Watch mode: monitoring for changes...
#    Watching: golden.json, hybrid_search.py, langgraph_app.py
#
# [5 seconds later, after you edit hybrid_search.py]
# 🔄 Change detected: hybrid_search.py
#
# ============================================================
# Running eval...
# ============================================================
# {
#   "top1_accuracy": 0.700,
#   "topk_accuracy": 0.900,
#   "total": 10,
#   "duration_secs": 11.2
# }
```

Useful when actively tuning retrieval parameters.

#### JSON Output (for CI/CD)

```bash
python eval_loop.py --json > results.json
# Outputs full results as JSON for parsing in scripts
```

### Eval Best Practices

1. **Start small** - 5-10 high-quality golden tests
2. **Cover both repos** - Mix vivified and faxbot questions
3. **Vary difficulty** - Include easy (exact matches) and hard (semantic) questions
4. **Set baseline early** - Before major changes
5. **Run before/after** - Compare when tuning parameters
6. **Use watch mode** - During active development
7. **Add failures** - When users report bad results, add those as golden tests

---

## Daily Workflows

### Morning Startup

```bash
# 1. Check infra is up
docker compose -f /Users/davidmontgomery/faxbot_folder/infra/docker-compose.yml ps

# 2. If not running, start it
docker compose -f /Users/davidmontgomery/faxbot_folder/infra/docker-compose.yml up -d

# 3. Activate venv
cd /Users/davidmontgomery/faxbot_folder/rag-service
. .venv/bin/activate

# 4. Start API (optional, only if using HTTP)
uvicorn serve_rag:app --host 127.0.0.1 --port 8012 &
```

### After Code Changes (Re-index)

When you make changes to Vivified or Faxbot codebases:

```bash
. .venv/bin/activate

# Re-index affected repo
REPO=vivified python index_repo.py  # or REPO=faxbot

# Run eval to check for regressions
python eval_loop.py --compare
```

**When to re-index:**
- After merging PRs
- When adding/removing files
- After significant refactors
- Daily/nightly via cron (optional)

### Adding New Golden Tests

```bash
# 1. Add test to golden.json (use your editor)

# 2. Test the new question manually first
. .venv/bin/activate
python -c "
from hybrid_search import search_routed_multi
results = search_routed_multi('your new question', repo_override='vivified', final_k=5)
print([r['file_path'] for r in results])
"

# 3. If results look good, run full eval
python eval_loop.py

# 4. If you're happy, update baseline
python eval_loop.py --baseline
```

### Debugging a Bad Answer

When RAG gives a wrong or low-confidence answer:

```bash
# 1. Use rag.search to see what was retrieved
. .venv/bin/activate
python -c "
from mcp_server import MCPServer
import json
req = {
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': 'rag_search',
        'arguments': {
            'repo': 'vivified',
            'question': 'your question here',
            'top_k': 10
        }
    }
}
server = MCPServer()
resp = server.handle_request(req)
result = json.loads(resp['result']['content'][0]['text'])
for r in result['results']:
    print(f\"{r['rerank_score']:.3f} {r['file_path']}:{r['start_line']}\")
"

# 2. Check if the expected file is in the index
python -c "
from qdrant_client import QdrantClient
import os
q = QdrantClient(url=os.getenv('QDRANT_URL', 'http://127.0.0.1:6333'))
res = q.scroll(
    collection_name='code_chunks_vivified',
    scroll_filter={'must': [{'key': 'file_path', 'match': {'text': 'path/to/file.py'}}]},
    limit=5
)
print(len(res[0]), 'chunks found')
"

# 3. If file is missing, check if it was indexed
grep "path/to/file.py" out/vivified/chunks.jsonl

# 4. If not indexed, check if it's being skipped
# Edit ast_chunker.py skip_dirs or LANG_MAP if needed
```

### Testing MCP Tools Manually

```bash
. .venv/bin/activate

# List tools
python -c "
from mcp_server import MCPServer
import json
req = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list', 'params': {}}
print(json.dumps(MCPServer().handle_request(req), indent=2))
"

# Call rag_search
python -c "
from mcp_server import MCPServer
import json
req = {
    'jsonrpc': '2.0',
    'id': 2,
    'method': 'tools/call',
    'params': {
        'name': 'rag_search',
        'arguments': {'repo': 'vivified', 'question': 'OAuth', 'top_k': 3}
    }
}
print(json.dumps(MCPServer().handle_request(req), indent=2))
"
```

---

## Troubleshooting

### Infrastructure Issues

**Problem:** Qdrant returns 404 or connection refused

```bash
# Check if running
docker ps | grep qdrant

# Check logs
docker logs qdrant

# Restart
docker restart qdrant

# Check again
curl -s http://127.0.0.1:6333/collections
```

**Problem:** Redis connection fails

```bash
# Check if running
docker ps | grep rag-redis

# Test connection
docker exec rag-redis redis-cli ping
# Should return: PONG

# Check logs
docker logs rag-redis

# Restart
docker restart rag-redis
```

**Problem:** Collections missing

```bash
# List collections
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'

# If missing, re-index
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py
```

### Indexing Issues

**Problem:** "ModuleNotFoundError" during indexing

```bash
. .venv/bin/activate
pip install -r requirements.txt
```

**Problem:** OpenAI rate limits or 429 errors

```bash
# Indexing uses batched embeddings (64 per request)
# If you hit rate limits, add delays:
# Edit index_repo.py, add time.sleep(0.5) between batches

# Or use smaller repos first
REPO=vivified python index_repo.py
# Wait a few minutes
REPO=faxbot python index_repo.py
```

**Problem:** Qdrant 500 errors (payload too large)

This is already fixed in the current version (slim payloads + local code hydration).

If you still see this:
```bash
# Check payload sizes
python -c "
from qdrant_client import QdrantClient
import os
q = QdrantClient(url=os.getenv('QDRANT_URL', 'http://127.0.0.1:6333'))
point = q.retrieve('code_chunks_vivified', ids=[1], with_payload=True)[0]
print('Payload keys:', point.payload.keys())
# Should NOT include 'code' (moved to local chunks.jsonl)
"
```

### MCP Issues

**Problem:** Codex doesn't see the tools

```bash
# Check registration
codex mcp list

# If missing, re-register
codex mcp add faxbot-rag -- \
  /Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python \
  /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py

# Test manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py
```

**Problem:** Claude Code doesn't see the tools

1. Check config file exists:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Verify absolute paths (no ~, use full paths)

3. Restart Claude Code completely (not just close window)

4. Check Claude Code logs (if available in UI)

**Problem:** "Graph not initialized" in MCP calls

This means LangGraph failed to load. Check:

```bash
# Test Redis connection
docker exec rag-redis redis-cli ping

# Test graph initialization
. .venv/bin/activate
python -c "from langgraph_app import build_graph; g = build_graph(); print('✓ Graph OK')"
```

### Retrieval Quality Issues

**Problem:** Low accuracy / wrong results

1. **Check if indexed recently:**
   ```bash
   ls -lh out/vivified/chunks.jsonl out/faxbot/chunks.jsonl
   # If old, re-index
   ```

2. **Run eval to quantify:**
   ```bash
   python eval_loop.py
   # Look at top-1 and top-5 accuracy
   ```

3. **Inspect what's being retrieved:**
   ```bash
   python -c "
   from hybrid_search import search_routed_multi
   docs = search_routed_multi('your query', repo_override='vivified', final_k=10)
   for d in docs[:5]:
       print(f\"{d['rerank_score']:.3f} {d['file_path']}\")
   "
   ```

4. **Adjust parameters:**
   - Edit `hybrid_search.py`:
     - Increase `topk_dense` / `topk_sparse` for more candidates
     - Adjust layer bonuses in `_vivified_layer_bonus` / `_faxbot_layer_bonus`
     - Tune path bonuses
   - Edit `langgraph_app.py`:
     - Lower confidence thresholds (lines 53-54)
     - Increase multi-query rewrites (`MQ_REWRITES` env var)

5. **Re-run eval after changes:**
   ```bash
   python eval_loop.py --compare
   ```

---

## Model Selection & Alternatives

The RAG service currently uses:
- **Embeddings**: OpenAI `text-embedding-3-large` (3072 dims, $0.13/1M tokens)
- **Generation**: OpenAI `gpt-4o-mini` ($0.15/1M input, $0.60/1M output)

### Quick Alternatives

| Goal | Embedding | Generation | Cost Savings |
|------|-----------|------------|--------------|
| **Free (Cloud)** | Google Gemini | Gemini 1.5 Flash | 100% |
| **Best Value** | Voyage AI 3.5-lite | Gemini 1.5 Flash | ~75% |
| **Fully Local (Mac)** | nomic-embed-text (Ollama) | Qwen2.5-Coder 7B | 100% (no API) |
| **Local High-End** | BGE-M3 | Qwen2.5-Coder 32B | 100% (no API) |

### Hardware-Specific Recommendations

**Apple Silicon Macs (M1/M2/M3/M4):**
```bash
# Install Ollama
brew install ollama

# For 8-16GB RAM
ollama pull nomic-embed-text
ollama pull qwen2.5-coder:7b

# For 32GB+ RAM
ollama pull qwen2.5-coder:32b
```

**NVIDIA GPU (16GB+ VRAM):**
- Embeddings: NV-Embed-v2 (optimized for NVIDIA)
- Generation: Qwen2.5-Coder 32B or DeepSeek-Coder V2

**See [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) for:**
- Complete model comparison (20+ models)
- Performance benchmarks (MTEB scores, HumanEval)
- Migration guides (OpenAI → Local, OpenAI → Gemini)
- Cost analysis and ROI calculations
- Hardware-specific optimizations

---

## Advanced Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *required* | OpenAI API key for embeddings + generation |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant server URL |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection string |
| `REPO` | `vivified` | Active repo for indexing/retrieval |
| `MQ_REWRITES` | `4` | Number of multi-query expansions |
| `RERANKER_MODEL` | `BAAI/bge-reranker-v2-m3` | Cross-encoder model |
| `FAXBOT_PATH_BOOSTS` | `app/,lib/,config/,...` | Faxbot-specific path boosts |
| `EVAL_MULTI` | `1` | Use multi-query in eval (0/1) |
| `EVAL_FINAL_K` | `5` | Top-K for eval metrics |
| `GOLDEN_PATH` | `golden.json` | Path to golden test file |
| `BASELINE_PATH` | `eval_baseline.json` | Path to eval baseline |

### Tuning Retrieval

**To boost specific file types or layers:**

Edit `hybrid_search.py`:

```python
# Adjust layer bonus tables (lines 21-37)
table={'server':{'kernel':0.10,'plugin':0.04,'ui':0.00,...}}
#              ↑ increase these to boost more

# Adjust path bonuses (lines 61-73)
for sfx, b in [
    ('/identity/', 0.12),  # ← increase bonus
    ('/auth/', 0.12),
    ...
]:
```

**To change confidence gates:**

Edit `langgraph_app.py`:

```python
# Line 53: Lower thresholds to generate more often
if top1 >= 0.62 or avg5 >= 0.55 or conf >= 0.55:
#         ↑ lower these to be less strict
```

**To use more retrieval candidates:**

Edit `hybrid_search.py` (search_routed_multi function, around line 120):

```python
docs = search_routed(q, repo_override=repo, topk_dense=75, topk_sparse=75, final_k=20)
#                                             ↑ increase for more candidates
```

### Adding New Languages

Edit `ast_chunker.py`:

```python
LANG_MAP = {
    ".py": "python",
    ".rb": "ruby",    # ← add Ruby
    ".go": "go",
    # ... add more
}

FUNC_NODES = {
    "ruby": {"class", "module", "def"},  # ← define AST node types
    # ...
}
```

Then re-index:
```bash
REPO=faxbot python index_repo.py
```

### Building Code Cards (Optional)

Code cards are 1-3 line summaries that can improve retrieval for UI/integration questions:

```bash
. .venv/bin/activate

# Build cards for Vivified
REPO=vivified python build_cards.py

# Build cards for Faxbot (limit to 300 chunks initially)
REPO=faxbot CARDS_MAX=300 python build_cards.py

# Cards are saved to:
# out/vivified/cards.jsonl
# out/vivified/bm25_cards/
```

Cards are automatically used by `hybrid_search.py` if present.

---

## File Reference

| File | Purpose |
|------|---------|
| `serve_rag.py` | FastAPI HTTP server |
| `langgraph_app.py` | LangGraph pipeline (iterative retrieval) |
| `hybrid_search.py` | Hybrid search (BM25 + dense + rerank) |
| `index_repo.py` | Indexing script (chunks → BM25 → Qdrant) |
| `mcp_server.py` | MCP tool server for agents |
| `eval_rag.py` | Basic eval runner |
| `eval_loop.py` | Advanced eval with baselines/regressions |
| `build_cards.py` | Code card summaries |
| `ast_chunker.py` | AST-aware code chunking |
| `rerank.py` | Cross-encoder reranking |
| `embed_cache.py` | Embedding cache (avoids re-embedding) |
| `golden.json` | Golden test questions |
| `AGENTS.md` | Agent behavior guidelines |
| `MCP_README.md` | MCP-specific docs |
| `QUICKSTART_MCP.md` | Quick MCP reference |

---

## Support & References

- **MCP Specification:** https://modelcontextprotocol.io/
- **Codex CLI:** https://github.com/openai/codex
- **Codex MCP Docs:** https://developers.openai.com/codex/mcp/
- **OpenAI Agents SDK:** https://openai.github.io/openai-agents-python/
- **AgentKit:** https://openai.com/index/introducing-agentkit/
- **LangGraph:** https://python.langchain.com/docs/langgraph
- **Qdrant:** https://qdrant.tech/documentation/

---

## Quick Command Reference

```bash
# Infrastructure
docker compose -f ../infra/docker-compose.yml up -d
docker compose -f ../infra/docker-compose.yml ps
docker restart qdrant rag-redis

# Indexing
. .venv/bin/activate
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py

# API Server
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# Eval
python eval_loop.py
python eval_loop.py --baseline
python eval_loop.py --compare
python eval_loop.py --watch

# MCP
codex mcp list
codex mcp add faxbot-rag -- .venv/bin/python mcp_server.py
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | .venv/bin/python mcp_server.py

# Test retrieval
python -c "from hybrid_search import search_routed_multi; print(search_routed_multi('oauth', repo_override='vivified', final_k=5))"
```

---

**Last Updated:** 2025-10-07
**Version:** 1.0.0
**Status:** Production Ready ✓

---

## Additional Documentation

📂 **See [docs/README.md](docs/README.md) for complete documentation index**

Comprehensive guides are available in the [`docs/`](docs/) folder:

### 📘 Core Documentation
- **[MCP Integration Guide](docs/MCP_README.md)** - Complete MCP server documentation
  - MCP protocol details
  - Tool specifications (`rag.answer`, `rag.search`)
  - Troubleshooting MCP connections
  - Agent behavior rules

- **[Quick Start MCP](docs/QUICKSTART_MCP.md)** - Fast reference card
  - Essential commands
  - Quick examples for Codex and Claude Code
  - Common workflows

### 🤖 Model Selection
- **[Model Recommendations 2025](docs/MODEL_RECOMMENDATIONS.md)** - Comprehensive model guide
  - 20+ embedding models (cloud + local)
  - 15+ inference models (cloud + local)
  - Hardware-specific recommendations (Mac M1-M4, NVIDIA, CPU)
  - Migration guides (OpenAI → Local, OpenAI → Gemini, etc.)
  - Cost/performance analysis with benchmarks
  - ROI calculations and optimization strategies

### 📋 Implementation Details
- **[Implementation Summary](docs/IMPLEMENTATION_COMPLETE.md)** - What was delivered
  - Complete feature list
  - Architecture diagrams
  - Smoke test results
  - Comparison with previous failed implementations

- **[Summary](docs/SUMMARY.md)** - Quick overview
  - Key features
  - Files created
  - Quick command reference

---

## File Reference

### Main Application Files
| File | Purpose |
|------|---------|
| `serve_rag.py` | FastAPI HTTP server (`/health`, `/answer`) |
| `langgraph_app.py` | LangGraph pipeline (iterative retrieval) |
| `hybrid_search.py` | Hybrid search (BM25 + dense + rerank) |
| `index_repo.py` | Indexing script (chunks → BM25 → Qdrant) |
| `mcp_server.py` | **MCP tool server for AI agents** |
| `eval_rag.py` | Basic eval runner |
| `eval_loop.py` | **Advanced eval with baselines/regressions** |
| `build_cards.py` | Code card summaries |
| `ast_chunker.py` | AST-aware code chunking |
| `rerank.py` | Cross-encoder reranking |
| `embed_cache.py` | Embedding cache (avoids re-embedding) |

### Configuration & Data
| File | Purpose |
|------|---------|
| `golden.json` | **Golden test questions for eval** |
| `.env` | Environment variables (API keys, URLs) |
| `requirements.txt` | Python dependencies |
| `AGENTS.md` | **Agent behavior guidelines** |

### Documentation
| File | Purpose |
|------|---------|
| `README.md` | **This file - complete setup guide** |
| `docs/MCP_README.md` | MCP technical documentation |
| `docs/QUICKSTART_MCP.md` | Quick MCP reference |
| `docs/MODEL_RECOMMENDATIONS.md` | Model selection guide (2025) |
| `docs/IMPLEMENTATION_COMPLETE.md` | Implementation summary |
| `docs/SUMMARY.md` | Quick overview |

---

## Quick Command Reference

```bash
# === Infrastructure ===
docker compose -f ../infra/docker-compose.yml up -d
docker compose -f ../infra/docker-compose.yml ps
docker restart qdrant rag-redis

# === Indexing ===
. .venv/bin/activate
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py

# === API Server ===
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# === Eval ===
python eval_loop.py
python eval_loop.py --baseline
python eval_loop.py --compare
python eval_loop.py --watch

# === MCP ===
codex mcp list
codex mcp add faxbot-rag -- .venv/bin/python mcp_server.py
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | .venv/bin/python mcp_server.py

# === Test Retrieval ===
python -c "from hybrid_search import search_routed_multi; print(search_routed_multi('oauth', repo_override='vivified', final_k=5))"
```



---

## Additional Documentation

Comprehensive guides are available in the [`docs/`](docs/) folder:

### 📘 Core Documentation
- **[MCP Integration Guide](docs/MCP_README.md)** - Complete MCP server documentation
  - MCP protocol details
  - Tool specifications (`rag.answer`, `rag.search`)
  - Troubleshooting MCP connections
  - Agent behavior rules

- **[Quick Start MCP](docs/QUICKSTART_MCP.md)** - Fast reference card
  - Essential commands
  - Quick examples for Codex and Claude Code
  - Common workflows

### 🤖 Model Selection
- **[Model Recommendations 2025](docs/MODEL_RECOMMENDATIONS.md)** - Comprehensive model guide
  - 20+ embedding models (cloud + local)
  - 15+ inference models (cloud + local)
  - Hardware-specific recommendations (Mac M1-M4, NVIDIA, CPU)
  - Migration guides (OpenAI → Local, OpenAI → Gemini, etc.)
  - Cost/performance analysis with benchmarks
  - ROI calculations and optimization strategies

### 📋 Implementation Details
- **[Implementation Summary](docs/IMPLEMENTATION_COMPLETE.md)** - What was delivered
  - Complete feature list
  - Architecture diagrams
  - Smoke test results
  - Comparison with previous failed implementations

- **[Summary](docs/SUMMARY.md)** - Quick overview
  - Key features
  - Files created
  - Quick command reference

---

## File Reference

### Main Application Files
| File | Purpose |
|------|---------|
| `serve_rag.py` | FastAPI HTTP server (`/health`, `/answer`) |
| `langgraph_app.py` | LangGraph pipeline (iterative retrieval) |
| `hybrid_search.py` | Hybrid search (BM25 + dense + rerank) |
| `index_repo.py` | Indexing script (chunks → BM25 → Qdrant) |
| `mcp_server.py` | **MCP tool server for AI agents** |
| `eval_rag.py` | Basic eval runner |
| `eval_loop.py` | **Advanced eval with baselines/regressions** |
| `build_cards.py` | Code card summaries |
| `ast_chunker.py` | AST-aware code chunking |
| `rerank.py` | Cross-encoder reranking |
| `embed_cache.py` | Embedding cache (avoids re-embedding) |

### Configuration & Data
| File | Purpose |
|------|---------|
| `golden.json` | **Golden test questions for eval** |
| `.env` | Environment variables (API keys, URLs) |
| `requirements.txt` | Python dependencies |
| `AGENTS.md` | **Agent behavior guidelines** |

### Documentation
| File | Purpose |
|------|---------|
| `README.md` | **This file - complete setup guide** |
| `docs/MCP_README.md` | MCP technical documentation |
| `docs/QUICKSTART_MCP.md` | Quick MCP reference |
| `docs/MODEL_RECOMMENDATIONS.md` | Model selection guide (2025) |
| `docs/IMPLEMENTATION_COMPLETE.md` | Implementation summary |
| `docs/SUMMARY.md` | Quick overview |

---

## Quick Command Reference

```bash
# === Infrastructure ===
docker compose -f ../infra/docker-compose.yml up -d
docker compose -f ../infra/docker-compose.yml ps
docker restart qdrant rag-redis

# === Indexing ===
. .venv/bin/activate
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py

# === API Server ===
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# === Eval ===
python eval_loop.py
python eval_loop.py --baseline
python eval_loop.py --compare
python eval_loop.py --watch

# === MCP ===
codex mcp list
codex mcp add faxbot-rag -- .venv/bin/python mcp_server.py
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | .venv/bin/python mcp_server.py

# === Test Retrieval ===
python -c "from hybrid_search import search_routed_multi; print(search_routed_multi('oauth', repo_override='vivified', final_k=5))"
```

---

## CLI Chat Interface

For interactive terminal chat with conversation memory:

```bash
. .venv/bin/activate

# Install rich library for terminal UI
pip install rich

# Start chat (vivified repo)
export REPO=vivified
export THREAD_ID=my-session
python chat_cli.py
```

**Commands:**
- Type your question directly
- `/repo faxbot` - Switch repository
- `/clear` - Clear conversation history
- `/help` - Show commands
- `/exit` - Exit chat

**Features:**
- Redis-backed conversation memory
- Rich terminal UI with markdown rendering
- Citation display with file paths and scores
- Per-repo conversation threads
