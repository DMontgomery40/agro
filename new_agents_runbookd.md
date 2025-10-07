# New Agents Runbook (Phased Checklist)

Use this to bring up and verify the strict per‑repo RAG service (Vivified/Faxbot). Mark each step as you complete it. Keep runs reproducible and cheap.

## Phase 0 — Initialize & Context
- [x] Confirm repo: `rag-service` (this file) and source repos at:
  - Vivified: `/Users/davidmontgomery/faxbot_folder/vivified`
  - Faxbot: `/Users/davidmontgomery/faxbot_folder/faxbot`
- [x] Confirm infra compose file: `/Users/davidmontgomery/faxbot_folder/infra/docker-compose.yml`

## Phase 1 — Infra Health
- [x] Qdrant up: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:6333/collections` → `200`
- [x] Redis up: `docker exec rag-redis redis-cli ping` → `PONG`
- [x] Counts (optional): in Python `QdrantClient().count('code_chunks_vivified').count`

## Phase 2 — Environment
- [x] Activate venv: `. .venv/bin/activate`
- [x] Verify deps: `.venv/bin/python -c "import fastapi, qdrant_client, bm25s"`

## Phase 3 — Index (Per Repo)
- [x] Vivified: `REPO=vivified python index_repo.py` — verified artifacts present
- [x] Faxbot: `REPO=faxbot python index_repo.py` — verified artifacts present

## Phase 4 — Cards (Optional/Partial)
- [x] Vivified: `REPO=vivified python build_cards.py` — verified
- [x] Faxbot (partial): `REPO=faxbot CARDS_MAX=300 python build_cards.py` — verified

## Phase 5 — Service
- [x] Run API: `uvicorn serve_rag:app --host 127.0.0.1 --port 8012` — already running
- [x] Health: `curl -s localhost:8012/health`
- [x] Answer (Vivified): `GET /answer?q=...&repo=vivified` → header `[repo: vivified]`
- [x] Answer (Faxbot): `GET /answer?q=...&repo=faxbot` → header `[repo: faxbot]`

## Phase 6 — CLI Chat
- [ ] `export REPO=vivified; export THREAD_ID=dev-1; python chat_cli.py` (N/A: script not present)
- [ ] Switch repo: `/repo faxbot`; ask a targeted question
- [ ] `/save`, `/exit`

## Phase 7 — Eval (Optional)
- [ ] Add `golden.json` items: `{ "q": "...", "repo": "vivified", "expect_paths": ["..."] }`
- [ ] Run: `REPO=vivified EVAL_MULTI=1 EVAL_FINAL_K=5 python eval_rag.py`

## Phase 8 — Tuning (If Needed)
- [ ] Gate: adjust thresholds (e.g., top‑1 ≥ 0.60, avg‑5 ≥ 0.52 on UI/integration)
- [ ] Faxbot path boosts: env `FAXBOT_PATH_BOOSTS`
- [ ] Dense 500s: lower `topk_dense` or retry; BM25 + hydration fallback

## Fix Log — 2025‑10‑07
- [x] Repo header mismatch without repo override fixed. Propagate routed repo from retrieval into graph state and use in headers.
  - LangGraph: `langgraph_app.py:1` (env loading), `langgraph_app.py:28`, `langgraph_app.py:60`, `langgraph_app.py:80`.
- [x] .env path resolution de‑hardcoded. Load from repo root `.env` via `Path(__file__).parent` and `find_dotenv`.
  - Files: `langgraph_app.py:1`, `hybrid_search.py:1`, `index_repo.py:1`.
- [x] **MCP Integration Implemented** (2025-10-07)
  - Created `mcp_server.py` with `rag.answer` and `rag.search` tools
  - Registered with Codex: `codex mcp add faxbot-rag`
  - Updated `AGENTS.md` with agent rules (never assume user wrong, always call RAG first, never hallucinate paths)
  - Built eval loop: `eval_loop.py` with baseline tracking, regression detection, watch mode
  - Created `golden.json` with 10 starter test cases (5 vivified, 5 faxbot)
  - Documentation: See [`MCP_README.md`](MCP_README.md)

### Quick Validation (local)
- Imports: `. .venv/bin/activate && python -c "import langgraph_app, hybrid_search, index_repo; print('ok')"`
- Router sanity: `. .venv/bin/activate && python - <<'PY'\nfrom hybrid_search import route_repo; q='Where do we mask PHI in events?'; print(route_repo(q,'vivified'))\nPY`
- Retrieval state carries repo: `. .venv/bin/activate && python - <<'PY'\nimport os; os.environ['MQ_REWRITES']='1'\nfrom langgraph_app import retrieve_node\nres=retrieve_node({'question':'Where do we mask PHI in events?','documents':[],'generation':'','iteration':0,'confidence':0.0,'repo':None})\nprint('repo:', res.get('repo'))\nPY`

Notes: Restart the FastAPI process to pick up code changes before validating `/answer` headers.
