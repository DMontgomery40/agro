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
  - `common/`: shared helpers
    - `common/config_loader.py` (was root `config_loader.py`)
    - `common/paths.py` (was root `path_config.py`)
    - `common/filtering.py` (was root `filtering.py`)
    - `common/metadata.py` (was root `metadata_enricher.py`)
    - `common/qdrant_utils.py` (was root `qdrant_recreate_fallback.py`)
  - `retrieval/`: search + rerank + AST
    - `retrieval/hybrid_search.py`
    - `retrieval/rerank.py`
    - `retrieval/ast_chunker.py`
    - `retrieval/embed_cache.py`
  - `indexer/`: indexing + cards
    - `indexer/index_repo.py`
    - `indexer/build_cards.py`

- Root shims (keep CLI paths and imports stable)
- Removed root shims. Use canonical modules:
  - API app: `uvicorn server.app:app`
  - `config_loader.py` → re-exports `common/config_loader.py`
  - `path_config.py` → re-exports `common/paths.py`
  - `filtering.py` → re-exports `common/filtering.py`
  - `metadata_enricher.py` → re-exports `common/metadata.py`
  - `qdrant_recreate_fallback.py` → re-exports `common/qdrant_utils.py`
  - `chat_cli.py` (CLI chat)
- Indexing: `python -m indexer.index_repo`
- Cards: `python -m indexer.build_cards`
- Retrieval: import from `retrieval.hybrid_search`
  - `env_model.py` → re-exports from `server/env_model.py`
  - `langgraph_app.py` → re-exports `server/langgraph_app.py`
  - `index_stats.py` → re-exports `server/index_stats.py`
- MCP (stdio): `python -m server.mcp.server`
- MCP (HTTP): `python -m server.mcp.http`

Why shims remain

- Avoid breaking existing commands like `python index_repo.py` or imports like `from hybrid_search import search_routed_multi`.
- Scripts (`scripts/up.sh`, CI, and MCP registrations) still reference root filenames.
- Once all internal imports and tooling point to canonical packages, shims can be removed in a follow-up change.

Where to find key functionality

- API/GUI service: `server/app.py` (mounts `/gui`, `/docs`, `/files`, config endpoints).
- Path resolution: `path_config.py` with `repo_root()`, `files_root()`, `gui_dir()`, `docs_dir()`, `data_dir()`. See: path_config.py:1-40, 42-80.
  (Now canonical: `common/paths.py`)
- Indexing: `indexer/index_repo.py` (root shim at `index_repo.py`). See: index_repo.py:1-1.
- Index stats: `server/index_stats.py` (root shim at `index_stats.py`). See: index_stats.py:1-2.
- Retrieval: `retrieval/hybrid_search.py`.
  - MCP: `server/mcp/server.py` (stdio), `server/mcp/http.py` (HTTP).

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

Archived/moved (unused stubs)

- Moved to `scripts/archive/` (not referenced by runtime):
  - `autoscaler.py`, `watchdog.py`, `runtime_config.py`, `feature_flags.py`, `vivified_rag.py`
