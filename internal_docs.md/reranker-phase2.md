Reranker Phase 2 — Cohere UX + Docs
===================================

Scope
- Improve Cohere reranker usability in the GUI with ready-to-pick model options, verbose help tips, and updated guidance for end-users and agents.

What’s new (Phase 2 kickoff)
- GUI → Configuration → Retrieval → “Reranking” now includes:
  - Rerank Backend (RERANK_BACKEND): none | local | hf | cohere
  - Cohere Model (COHERE_RERANK_MODEL): dropdown with common options (rerank-3.5, rerank-english-v3.0, rerank-multilingual-v3.0, rerank-english-lite-v3.0)
  - Cohere API Key (COHERE_API_KEY)
  - Local/HF Model (RERANKER_MODEL)
  - HF Trust Remote Code (TRANSFORMERS_TRUST_REMOTE_CODE)
- Verbose tooltips for all reranking knobs (hover “?” on labels).

How to use
1) Open GUI at “/” → Configuration → Retrieval → Reranking.
2) Set RERANK_BACKEND=cohere.
3) Pick a Cohere model from the dropdown (start with rerank-3.5).
4) Enter COHERE_API_KEY and click “Apply All Changes”.
5) Search via “Search” tab or call /search to confirm rerank ordering.

Agent notes
- These settings persist to .env via /api/config and apply immediately (no restart) for search/rerank.
- Answer generation still requires a generation model (see Models tab). Use local OLLAMA_URL or API key.

Next steps (Phase 2 tasks)
- Add GUI knob for RERANK_INPUT_SNIPPET_CHARS and wire to rerankers (done in code; add field in GUI → Misc or Retrieval).
- Expose CONF_TOP1 / CONF_AVG5 / CONF_ANY thresholds in GUI for acceptance gating.
- Card-boost visibility and editing in GUI (cards.jsonl): build, view, prune from the dashboard.
- Docs: merge this file into README navigation and add screenshots for the Reranking section.

References
- Reranking UI: gui/index.html
- Tooltips: gui/app.js (HELP mapping)
- Rerank runtime logic: retrieval/rerank.py
- Config API: server/app.py (/api/config)

