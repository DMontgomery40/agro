[Handoff Prompt: RAG Service — Vivified + Faxbot (Strict Per‑Repo)]

  Goal

  - Operate a local, production‑style RAG service that answers code questions
    about Vivified or Faxbot (never fused), with strong retrieval, cheap
    updates, and clear repo selection in every answer.

  Repo & Paths

  - Service root: /Users/davidmontgomery/faxbot_folder/rag-service
  - Source repos:
      - Vivified: /Users/davidmontgomery/faxbot_folder/vivified
      - Faxbot: /Users/davidmontgomery/faxbot_folder/faxbot
  - Canonical doc: updated_runbook.md

  Infra (already running)

  - Qdrant v1.15.5 (mmap off), Redis Stack (JSON) via Compose
      - Compose: /Users/davidmontgomery/faxbot_folder/infra/docker-compose.yml
      - Qdrant: 127.0.0.1:6333; Redis: 127.0.0.1:6379

  Key Design (what’s live)

  - Strict per‑repo routing (never fused)
      - Repo is selected by explicit override (?repo=vivified|faxbot) or a tiny
        router; answers begin with “[repo: vivified]” or “[repo: faxbot]”.
  - Retrieval
      - Dense: OpenAI text‑embedding‑3‑large (3072‑d), slim Qdrant payload (no
        code body), local code hydration from out/<REPO>/chunks.jsonl.
      - Sparse: BM25 (bm25s) over chunk bodies; optional BM25 over cards
        (codebook summaries).
      - Multi‑query: expands query (4o‑mini) 2–4 variants per repo, unions
        within that repo only, re‑ranks via cross‑encoder.
  - Scoring & Gate
      - Repo‑aware layer bonuses (Vivified: kernel/plugin/ui/docs; Faxbot:
        server/integration/ui/sdk/infra) + path/provider hints.
      - Generate if top‑1 ≥ 0.62 or avg‑5 ≥ 0.55 (final_k=20).
  - Embedding cache
      - Reindex embeds only new/changed chunks (by hash), written to out/<REPO>/
        embed_cache.jsonl.
  - CLI chat with memory
      - chat_cli.py uses LangGraph/Redis checkpoints keyed by THREAD_ID,
        remembers chat turns, strict per‑repo.

  Code Map (files to know)

  - index_repo.py:
      - REPO‑aware: sets BASES, OUTDIR, COLLECTION from REPO={vivified|faxbot}.
      - Chunk payload tags: repo, layer (REPO‑aware detect_layer), origin (kept
        for future).
      - Embedding cache: EmbeddingCache (OpenAI 3‑large).
  - hybrid_search.py:
      - search_routed_multi(query, repo_override=None, m=4, final_k=10): strict
        per‑repo multi‑query search.
      - Slim Qdrant payload; local code hydration via _load_code_cache(repo).
      - Layer/provider/path bonuses; Faxbot path boosts via FAXBOT_PATH_BOOSTS.
  - langgraph_app.py:
      - build_graph(): Redis checkpointer; retrieve uses search_routed_multi.
      - RAGState includes repo, history; generate_node uses last turns and adds
        [repo: ...] header.
  - build_cards.py: builds JSON “cards” + BM25 at out/<REPO>/bm25_cards
    (Vivified built; Faxbot partially with CARDS_MAX=300).
  - eval_rag.py: simple golden eval runner.

  Run (common)

  - Activate: . .venv/bin/activate
  - API:
      - uvicorn serve_rag:app --host 127.0.0.1 --port 8012
      - GET /answer?q=...&repo=vivified (or faxbot). Health: /health.
  - CLI chat:
      - export REPO=vivified; export THREAD_ID=dev-1; python chat_cli.py
      - Commands: /repo, /thread, /save, /exit; inline override: vivified:
        <question>

  Index & Cards (cheap; per repo)

  - Reindex Vivified:
      - export REPO=vivified; python index_repo.py
  - Reindex Faxbot:
      - export REPO=faxbot; python index_repo.py
  - Build cards:
      - Vivified: REPO=vivified python build_cards.py
      - Faxbot (partial to start): REPO=faxbot CARDS_MAX=300 python
        build_cards.py

  Eval (optional)

  - Create golden.json with items: { "q": "...", "repo": "vivified",
    "expect_paths": ["..."] }
  - Run: REPO=vivified EVAL_MULTI=1 EVAL_FINAL_K=5 python eval_rag.py

  Env Vars (knobs)

  - REPO: vivified|faxbot (default vivified)
  - MQ_REWRITES: default 4; set 1 to disable multi‑query
  - FAXBOT_PATH_BOOSTS: comma‑sep substrings to boost (default
    “app/,lib/,config/,scripts/,server/,api/,api/app,app/services,app/routers”)
  - OPENAI_API_KEY: required for embeddings/rewrites
  - THREAD_ID: chat session id

  Data Outputs (per repo under out/<REPO>)

  - chunks.jsonl: all chunks (with hash, id, file_path, code, etc.)
  - bm25_index: BM25 index for chunk bodies (+ vocab/stopwords/corpus.txt)
  - embed_cache.jsonl: hash → vector
  - cards.jsonl, bm25_cards: optional cards summary index

  Known Behaviors & Mitigations

  - Qdrant occasional 500s (dense search): mitigated by slim payload; retrieval
    falls back to BM25 + code hydration; multi‑query improves recall.
  - Faxbot vendor heaviness: path boosts push first‑party app code up without
    hiding vendor; consider growing Faxbot CARDS_MAX overnight for better intent
    hits.
  - Gate handles strong top‑1 vs weak neighbors; generation runs a second pass
    if low confidence.

  Smoke Checklist (quick)

  - Qdrant: curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6333/
    collections → 200
  - Redis: docker exec rag-redis redis-cli ping → PONG
  - Counts: in Python, QdrantClient().count('code_chunks_vivified').count and
    'code_chunks_faxbot'
  - API: /health → healthy; /answer?...&repo=vivified|faxbot → header
    [repo: ...] and citations
  - CLI: run python chat_cli.py, ask:
      - vivified: Where is ProviderSetupWizard rendered?
      - /repo faxbot, then Where do we mask PHI in events?
      - /save, /exit

  If something breaks

  - Dense 500s: lower per‑repo topk_dense or retry; BM25+hydration keeps it
    working.
  - Low confidence: multi‑query is on; tweak gate if needed (e.g., top‑1 ≥ 0.60
    or avg‑5 ≥ 0.52 on UI/integration).
  - Missing code in rerank: ensure local hydration _load_code_cache sees
    chunks.jsonl and chunk hashes are present.

  Deliverable State

  - Strict per‑repo routing + header; multi‑query retrieval; slim payload +
    local hydration; embedding cache; cards for Vivified (partial Faxbot); CLI
    chat with memory; API healthy; runbook updated.
