# Package Layout Migration (Canonical Packages + Shims)

This repo has been reorganized to make navigation easier without breaking existing entrypoints or imports. Canonical code now lives in dedicated packages, while tiny root-level shims preserve compatibility during transition.

What changed

- Canonical packages
  - `server/`: app/graph/model/stats
    - `server/langgraph_app.py`
    - `server/env_model.py`
    - `server/index_stats.py`
    - `server/app.py` (FastAPI app; root shim `serve_rag.py`)
    - `server/mcp/server.py` (stdio MCP)
    - `server/mcp/http.py` (HTTP MCP)
  - `retrieval/`: search + rerank + AST
    - `retrieval/hybrid_search.py`
    - `retrieval/rerank.py`
    - `retrieval/ast_chunker.py`
    - `retrieval/embed_cache.py`
  - `indexer/`: indexing + cards
    - `indexer/index_repo.py`
    - `indexer/build_cards.py`

- Root shims (keep CLI paths and imports stable)
  - `serve_rag.py` → re-exports `server/app.py: app`
  - `chat_cli.py` (CLI chat)
  - `index_repo.py` → re-exports from `indexer/index_repo.py`
  - `build_cards.py` → re-exports from `indexer/build_cards.py`
  - `hybrid_search.py` → forwards to `retrieval/hybrid_search.py` (plus adapters)
  - `env_model.py` → re-exports from `server/env_model.py`
  - `langgraph_app.py` → re-exports `server/langgraph_app.py`
  - `index_stats.py` → re-exports `server/index_stats.py`
  - `mcp_server.py` → shim to `server/mcp/server.py`
  - `mcp_server_http.py` → shim to `server/mcp/http.py`

Why shims remain

- Avoid breaking existing commands like `python index_repo.py` or imports like `from hybrid_search import search_routed_multi`.
- Scripts (`scripts/up.sh`, CI, and MCP registrations) still reference root filenames.
- Once all internal imports and tooling point to canonical packages, shims can be removed in a follow-up change.

Where to find key functionality

- API/GUI service: `serve_rag.py` (mounts `/gui`, `/docs`, `/files`, config endpoints). See: serve_rag.py:1-120, 160-220, 720-840.
- Path resolution: `path_config.py` with `repo_root()`, `files_root()`, `gui_dir()`, `docs_dir()`, `data_dir()`. See: path_config.py:1-40, 42-80.
- Indexing: `indexer/index_repo.py` (root shim at `index_repo.py`). See: index_repo.py:1-1.
- Index stats: `server/index_stats.py` (root shim at `index_stats.py`). See: index_stats.py:1-2.
- Retrieval: `retrieval/hybrid_search.py` (root helper `hybrid_search.py`). See: hybrid_search.py:1-60.
- MCP: `server/mcp/server.py` (stdio), `server/mcp/http.py` (HTTP). Root shims remain: `mcp_server.py`, `mcp_server_http.py`.

GUI-first configuration (accessibility)

- All knobs are editable in the GUI. Use the “Infrastructure”, “Models/Embeddings”, and “Retrieval” tabs.
- Config endpoint: `/api/config` reads/writes `.env` and `repos.json`. See: serve_rag.py:160-220.
- Common env keys available in the GUI forms:
  - Paths: `REPO_ROOT`, `FILES_ROOT`, `GUI_DIR`, `DOCS_DIR`, `DATA_DIR`, `OUT_DIR_BASE`, `REPOS_FILE`
  - Retrieval: `MQ_REWRITES`, `FINAL_K`, `TOPK_DENSE`, `TOPK_SPARSE`, `CONF_TOP1`, `CONF_AVG5`, `HYDRATION_MODE`
  - Providers: `GEN_MODEL`, `EMBEDDING_TYPE`, `RERANK_BACKEND`, `COHERE_RERANK_MODEL`, `RERANKER_MODEL`, `OLLAMA_URL`
  - Indexing: `EMBEDDING_TYPE`, `SKIP_DENSE`

Definition of done (for future cleanup)

- All internal imports prefer `server.*`, `retrieval.*`, `indexer.*`.
- Shims no longer imported by any internal code or scripts.
- Scripts updated to call canonical entrypoints (or keep shims by design).
