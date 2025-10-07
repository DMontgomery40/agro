# Repository Guidelines

## Project Structure & Modules
- `serve_rag.py` — FastAPI service exposing `/health` and `/answer`.
- `langgraph_app.py` — LangGraph pipeline + Redis checkpoints (chat memory).
- `hybrid_search.py` — strict per‑repo retrieval (dense + BM25 + cross‑encoder, local code hydration).
- `index_repo.py` — chunking, BM25 index, Qdrant upsert, embed cache.
- `build_cards.py` — code "cards" summaries + BM25 index.
- `eval_rag.py` — simple golden eval runner.
- `mcp_server.py` — MCP (Model Context Protocol) server for Codex/agent integration.
- Data: `out/<REPO>/...`; Infra: `infra/docker-compose.yml`.

## MCP Integration (Codex/Agents)
- **MCP Server**: `mcp_server.py` exposes two tools via stdio:
  - `rag_answer(repo, question)` → full LangGraph answer + citations
  - `rag_search(repo, question, top_k=10)` → retrieval-only for debugging
- **Codex Setup**: Registered via `codex mcp add faxbot-rag -- python mcp_server.py`
  - Note: Tool names use underscores to satisfy OpenAI tool-name constraints.
- **Agent Rules** (for Codex/assistants):
  1. **Never assume the user is wrong** about file paths, function names, or code locations.
  2. **Always call RAG tools first** before claiming something doesn't exist or suggesting changes.
  3. **Never hallucinate file paths** — use retrieval results as ground truth.
  4. **Respect repo boundaries** — vivified and faxbot are separate; never fuse them.
  5. **Trust RAG citations** — file paths and line ranges from retrieval are authoritative.

## Build, Test, Run
- `. .venv/bin/activate` — activate virtualenv.
- `uvicorn serve_rag:app --host 127.0.0.1 --port 8012` — run API locally.
- Index: `REPO=vivified python index_repo.py` (or `REPO=faxbot`).
- Cards: `REPO=vivified python build_cards.py` (Faxbot example: `REPO=faxbot CARDS_MAX=300 python build_cards.py`).
- Eval: `REPO=vivified EVAL_MULTI=1 EVAL_FINAL_K=5 python eval_rag.py`.

## Coding Style
- Python 3.11+, PEP 8, 4‑space indent; snake_case files; descriptive names.
- Type hints on public functions; module/function docstrings.
- Keep Qdrant payloads slim; hydrate code from `out/<REPO>/chunks.jsonl`.
- Strict per‑repo: never fuse Vivified/Faxbot; answers must start with `[repo: vivified]` or `[repo: faxbot]`.

## Testing
- Prefer small, deterministic checks via `eval_rag.py` (add cases to `golden.json`).
- If adding unit tests, place in `tests/`, name `test_*.py`, and assert: repo routing, retrieval paths, and gate thresholds.

## Commits & PRs
- Commits: imperative subject (<72 chars), focused diff; include rationale when nontrivial.
- PRs: clear description, linked issues, repro/validation steps (e.g., `curl localhost:8012/health`, example `/answer?...&repo=...`), and relevant screenshots/JSON excerpts.
- Keep changes scoped; avoid unrelated refactors.

## Security & Config
- Required: `OPENAI_API_KEY`. Useful: `REPO`, `QDRANT_URL`, `REDIS_URL`, `MQ_REWRITES`, `FAXBOT_PATH_BOOSTS`.
- Verify deps: `docker compose -f infra/docker-compose.yml ps`; Qdrant: `curl -s http://127.0.0.1:6333/collections`; Redis: `docker exec rag-redis redis-cli ping`.
