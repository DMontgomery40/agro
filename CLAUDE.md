
**Audience:** Code agents (Codex CLI, Claude Code) and humans working in this repo.
**Goal:** Always ground answers in this RAG, never mix Vivified/Faxbot, never assume the user is wrong, and call the provided tools **first**.

---

## 🔒 Non-negotiables (read first)

1) **Never mix repositories.** Vivified and Faxbot are strictly separate. Vivified is the framework; Faxbot is the integrations (providers, plugins, adapters—that's the product).
2) **Never assume user error.** If a path/API "seems wrong," call the RAG tools to verify.
3) **Always cite files + line ranges** from retrieval results when proposing code edits.
4) **If confidence is borderline**, return best citations + ask a clarifying question; don't guess.
5) **Prefer tools over memory.** Use MCP tools or the HTTP API before speculating.
6) **Use current stack only.** Responses API (not Chat Completions); default `GEN_MODEL` is `gpt-4o-mini-latest`.

Plain refs for agents/humans (open directly):
- Codex CLI repo (install, config): https://github.com/openai/codex
- MCP for Codex/ChatGPT (servers, connectors): https://platform.openai.com/docs/guides/tools-connectors-mcp
- Agents SDK (guardrails, tracing): https://openai.github.io/openai-agents-python/
- AgentKit overview (evals, tracing, workflows): https://openai.com/index/introducing-agentkit/
- Responses API (current): https://openai.com/index/new-tools-and-features-in-the-responses-api/
  (Choose a supported model alias like `gpt-4o-mini-latest`, or pin a dated variant.)

---

## Quick Commands (bundled, no placeholders)

### 0) Activate venv + dependency sanity
```bash
echo "activate venv" && \
. .venv/bin/activate && \
echo "verify deps" && \
python -c "import fastapi, qdrant_client, bm25s; print('✓ fastapi, qdrant_client, bm25s loaded')"
```

### 1) Bring up Infra (Qdrant + Redis) and verify
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service/infra && \
echo "compose up" && docker compose up -d && \
echo "check qdrant" && curl -s http://127.0.0.1:6333/collections || true && \
echo "check redis" && docker ps --format '{{.Names}}' | grep -i redis >/dev/null && \
docker exec "$(docker ps --format '{{.Names}}' | grep -i redis | head -n1)" redis-cli ping
```

### 2) Index (run after code changes)
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
echo "index vivified" && REPO=vivified python index_repo.py && \
echo "index faxbot" && REPO=faxbot python index_repo.py && \
echo "verify collections" && curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
```

### 3) Run the HTTP service (in its own terminal)
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
uvicorn serve_rag:app --host 127.0.0.1 --port 8012
```

Smoke check (second terminal):

```bash
curl -s "http://127.0.0.1:8012/health" && \
curl -s "http://127.0.0.1:8012/answer?q=Where%20is%20OAuth%20validated&repo=vivified"
```

### 4) MCP server (for agents)
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
python mcp_server.py
```

Register with Codex CLI (one-time):

```bash
codex mcp add rag-service -- python /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py && \
codex mcp list
```

### 5) Eval loop (local)
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
echo "run evals" && python eval_loop.py && \
echo "save baseline (optional)" && python eval_loop.py --baseline && \
echo "compare vs baseline" && python eval_loop.py --compare
```

### 6) Minimal CLI chat
```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
export REPO=vivified && export THREAD_ID=my-session && \
python chat_cli.py
```

---

## Architecture (ground truth)

```
User / Agent
   ↓
MCP Server (mcp_server.py)  ← tools: rag_answer(repo, question), rag_search(repo, question, top_k)
   ↓
LangGraph Orchestrator (langgraph_app.py)
   ↓
Hybrid Search (hybrid_search.py)
   ├─ BM25 (bm25s)
   ├─ Dense vectors (Qdrant; OpenAI embeddings 3072-d)
   └─ Cross-encoder rerank (e.g., BAAI/bge-reranker-v2-m3)
   ↓
Local Hydration (out/{repo}/chunks.jsonl)
   ↓
Generation (via Responses API; default `gpt-4o-mini-latest` or `GEN_MODEL`)
   ↓
Answer + Citations (must include file paths + line ranges)
```

### Repository routing
Routing is explicit via `repo` (vivified or faxbot).

Qdrant collections are separate (e.g., `code_chunks_vivified`, `code_chunks_faxbot`).

Every answer must begin with `[repo: vivified]` or `[repo: faxbot]`.

---

## Key Components

### Indexing (index_repo.py)

AST-aware chunking (ast_chunker.py), layer tagging (ui/server/integration/infra).

BM25 index build (stemming).

Embeddings: OpenAI text-embedding-3-large (3072 dims) → Qdrant upsert (metadata only).

Local cache to prevent re-embedding unchanged chunks.

Outputs: `out/{repo}/chunks.jsonl`, `out/{repo}/bm25_idx/`, optional `out/{repo}/cards.jsonl`.

### Hybrid search (hybrid_search.py)

Intent classification (ui/server/integration/sdk/infra) → per-repo layer bonuses.

Multi-query expansion (defaults enabled; count configurable).

BM25 + vector fusion → cross-encoder rerank → local hydration of code.

Returns top-K with `rerank_score`, `file_path`, `start_line`, `end_line`, `layer`, `repo`.

### LangGraph pipeline (langgraph_app.py)

Iterative retrieval with confidence gating (top-1 and/or avg-k).

Query rewriting on low confidence; multi-query fallback.

Redis checkpointer for convo state; strict per-repo state.

### MCP server (mcp_server.py)

stdio MCP server exposing:

- `rag_answer(repo, question)`
- `rag_search(repo, question, top_k)`

Consumed by Codex CLI and Claude Code.

---

## Storage

### Qdrant

http://127.0.0.1:6333

Collections per repo; payloads: `file_path`, `start_line`, `end_line`, `layer`, `repo`, `origin` (no raw code).

Vectors: 3072-d.

### Redis

redis://127.0.0.1:6379/0

LangGraph memory/checkpoint.

### Local files

- `out/{repo}/chunks.jsonl` (full code chunks)
- `out/{repo}/bm25_idx/` (BM25)
- `out/{repo}/cards.jsonl` (optional code "cards" for high-level hits)

---

## Environment

### Required

`OPENAI_API_KEY`

### Infra

- `QDRANT_URL` (default `http://127.0.0.1:6333`)
- `REDIS_URL` (default `redis://127.0.0.1:6379/0`)

### RAG

- `REPO` (vivified | faxbot) for indexers/CLIs
- `RERANKER_MODEL` (default `BAAI/bge-reranker-v2-m3`)
- `MQ_REWRITES` (multi-query count)

### Current stack

- `GEN_MODEL` (default `gpt-4o-mini-latest`; set a dated pin like `gpt-4o-mini-YYYY-MM-DD` if desired)
- `RESPONSES_API=1` (flag to enforce Responses API usage)

### Optional (overrides if implemented in code)

- `CONF_TOP1` (e.g., 0.60) and `CONF_AVG5` (e.g., 0.52) to calibrate gating
- `FINAL_K`, `TOPK_DENSE`, `TOPK_SPARSE` tuning knobs

If a variable isn't wired yet, prefer adding it rather than hard-coding thresholds. Avoid "drop gate to .50" just to "make it work."

---

## De-noising Indexing (critical for quality)

The indexer excludes vendor/3rd-party libraries to prevent retrieval pollution. **Provider implementations (Faxbot's integrations) are kept**; generic vendor libs are excluded.

**Exclude file location:** `data/exclude_globs.txt`

**Excluded patterns:**
- `vendor/`, `third_party/`, `site-packages/` (generic libs)
- `node_modules/`, `Pods/` (package managers)
- `.git/`, `.venv/`, `__pycache__/` (infrastructure)
- `dist/`, `build/`, `out/`, `.next/` (build artifacts)
- `*.min.js`, `*.bundle.js`, `*.map` (minified/bundled)
- Binary/media files (`.png`, `.jpg`, `.pdf`, `.zip`, etc.)

**Provider code** (adapters, plugins, integrations) stays indexed because that's Faxbot's product.

After updating `exclude_globs.txt`, re-index both repos:

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
REPO=vivified python index_repo.py && \
REPO=faxbot python index_repo.py
```

---

## Agent Behavior Rules (enforced)

1. **Call tools first.** Use `rag_answer` for answers, `rag_search` for discovery.
2. **Never hallucinate file paths.** Cite retrieved files + line ranges.
3. **Respect repo boundaries.** Never fuse Vivified and Faxbot.
4. **Borderline confidence:** present best citations and ask concise follow-ups.
5. **Security:** never surface PHI or secrets; redact before emitting.

---

## Evaluation & Quality

### Golden tests (golden.json):

```json
{ "q": "Where is OAuth token validated?", "repo": "vivified", "expect_paths": ["identity", "auth", "oauth", "token"] }
```

Substring match on `expect_paths` counts as a hit.

Expand golden set when agents miss or hallucinate.

### Run local evals

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && . .venv/bin/activate && \
python eval_loop.py && python eval_loop.py --compare
```

### Tuning tips

- Nudge `CONF_TOP1`/`CONF_AVG5` slightly (e.g., 0.60/0.52) rather than large drops.
- Adjust layer bonuses and top-K fusion knobs per repo.
- Prefer adding/refreshing `cards.jsonl` for "where is X done?" intent.

---

## Troubleshooting (one step at a time)

### Infra

```bash
echo "qdrant health" && curl -s http://127.0.0.1:6333/collections && \
echo "redis ping" && docker exec "$(docker ps --format '{{.Names}}' | grep -i redis | head -n1)" redis-cli ping || true
```

### Collections missing

```bash
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name' && \
echo "re-index vivified" && REPO=vivified python index_repo.py && \
echo "re-index faxbot" && REPO=faxbot python index_repo.py
```

### MCP not visible

```bash
codex mcp list || true && \
codex mcp add rag-service -- python /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py
```

### Low retrieval quality

```bash
python eval_loop.py && \
python - <<'PY'
from hybrid_search import search_routed_multi
docs = search_routed_multi("your query", repo_override="vivified", final_k=10)
for d in docs[:5]:
    print(f"{d['rerank_score']:.3f}  {d['file_path']}:{d['start_line']}-{d['end_line']}")
PY
```

---

## Docs inside this repo

- README.md – Full setup & usage
- START_HERE.md – Nav hub
- docs/QUICKSTART_MCP.md – Fast MCP setup
- docs/MCP_README.md – MCP details
- docs/MODEL_RECOMMENDATIONS.md – Model notes
- docs/SUMMARY.md – Overview
