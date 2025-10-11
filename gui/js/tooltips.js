// GUI Tooltips: human-readable help + accurate links
// Exposes window.Tooltips.{buildTooltipMap, attachTooltips}
(function(){
  function L(label, body, links){
    const linkHtml = (links||[]).map(([txt, href]) => `<a href="${href}" target="_blank" rel="noopener">${txt}</a>`).join(' ');
    return `<span class=\"tt-title\">${label}</span><div>${body}</div>` + (links && links.length ? `<div class=\"tt-links\">${linkHtml}</div>` : '');
  }

  function buildTooltipMap(){
    return {
      // Infrastructure & routing
      QDRANT_URL: L('Qdrant URL', 'HTTP URL for your Qdrant vector database. Used for dense vector queries during retrieval. If unavailable, retrieval still works via BM25 (sparse).', [
        ['Qdrant Docs: Collections', 'https://qdrant.tech/documentation/concepts/collections/'],
        ['Qdrant (GitHub)', 'https://github.com/qdrant/qdrant']
      ]),
      REDIS_URL: L('Redis URL', 'Connection string for Redis, used for LangGraph checkpoints and optional session memory. The graph runs even if Redis is down (stateless mode).', [
        ['Redis Docs', 'https://redis.io/docs/latest/']
      ]),
      REPO: L('Active Repository', 'Logical repository name for routing and indexing. MCP and CLI use this to scope retrieval.', [
        ['Docs: MCP Quickstart', '/docs/QUICKSTART_MCP.md']
      ]),
      COLLECTION_NAME: L('Collection Name', 'Optional override for the Qdrant collection name. Defaults to code_chunks_{REPO}. Set this if you maintain multiple profiles.', [
        ['Qdrant Docs: Collections', 'https://qdrant.tech/documentation/concepts/collections/']
      ]),
      COLLECTION_SUFFIX: L('Collection Suffix', 'Optional string appended to the default collection name for side-by-side comparisons.'),
      REPOS_FILE: L('Repos File', 'Path to repos.json that defines repo names, paths, keywords, path boosts, and layer bonuses used for routing.', [
        ['Local repos.json', '/files/repos.json']
      ]),
      REPO_PATH: L('Repo Path (fallback)', 'Absolute path to the active repo if repos.json is not available.'),
      OUT_DIR_BASE: L('Out Dir Base', 'Base directory where indices are stored. Use ./out.noindex-shared for a cross-branch shared index so agents always see the same data.', [
        ['Docs: README (Shared Index)', '/files/README.md']
      ]),
      RAG_OUT_BASE: L('RAG Out Base', 'Optional override for Out Dir Base; used by internal loaders if provided.'),
      MCP_HTTP_HOST: L('MCP HTTP Host', 'Bind address for the HTTP MCP server (fast transport). Use 0.0.0.0 to listen on all interfaces.', [
        ['Docs: Remote MCP', '/docs/REMOTE_MCP.md']
      ]),
      MCP_HTTP_PORT: L('MCP HTTP Port', 'TCP port for HTTP MCP server (default 8013).', [
        ['Docs: Remote MCP', '/docs/REMOTE_MCP.md']
      ]),
      MCP_HTTP_PATH: L('MCP HTTP Path', 'URL path for the HTTP MCP endpoint (default /mcp).', [
        ['Docs: Remote MCP', '/docs/REMOTE_MCP.md']
      ]),

      // Models / Providers
      GEN_MODEL: L('Generation Model', 'Model used for answer generation. Local examples: qwen3-coder:14b via Ollama. Cloud examples: gpt-4o-mini via OpenAI.', [
        ['OpenAI Models', 'https://platform.openai.com/docs/models'],
        ['Ollama API (GitHub)', 'https://github.com/ollama/ollama/blob/main/docs/api.md']
      ]),
      OLLAMA_URL: L('Ollama URL', 'Local inference endpoint for Ollama (e.g., http://127.0.0.1:11434/api). Used when GEN_MODEL targets a local model.', [
        ['Ollama API (GitHub)', 'https://github.com/ollama/ollama/blob/main/docs/api.md']
      ]),
      OPENAI_API_KEY: L('OpenAI API Key', 'API key used for OpenAI-based embeddings and/or generation.', [
        ['OpenAI: API Keys', 'https://platform.openai.com/docs/quickstart/step-2-set-up-your-api-key'],
        ['OpenAI Models', 'https://platform.openai.com/docs/models']
      ]),
      EMBEDDING_TYPE: L('Embedding Provider', 'Select which embeddings backend to use: openai (default), local (SentenceTransformers), voyage (Voyage AI), or gemini.', [
        ['OpenAI Embeddings', 'https://platform.openai.com/docs/guides/embeddings'],
        ['Voyage AI Embeddings', 'https://docs.voyageai.com/docs/embeddings'],
        ['Google Gemini Embeddings', 'https://ai.google.dev/gemini-api/docs/embeddings'],
        ['SentenceTransformers Docs', 'https://www.sbert.net/']
      ]),
      VOYAGE_API_KEY: L('Voyage API Key', 'API key for Voyage AI embeddings when EMBEDDING_TYPE=voyage.', [
        ['Voyage AI Docs', 'https://docs.voyageai.com/']
      ]),

      // Reranking
      RERANK_BACKEND: L('Rerank Backend', 'Cross-encoder reranker for better result ordering. Options: cohere (cloud), local (HF), or hf (custom).', [
        ['Cohere Docs: Rerank', 'https://docs.cohere.com/reference/rerank'],
        ['Cohere Python (GitHub)', 'https://github.com/cohere-ai/cohere-python']
      ]),
      COHERE_API_KEY: L('Cohere API Key', 'API key for Cohere reranking when RERANK_BACKEND=cohere.', [
        ['Cohere Dashboard: API Keys', 'https://dashboard.cohere.com/api-keys']
      ]),
      COHERE_RERANK_MODEL: L('Cohere Rerank Model', 'Cohere rerank model name (e.g., rerank-3.5). Check the provider docs for the latest list and pricing.', [
        ['Cohere Docs: Models', 'https://docs.cohere.com/docs/models']
      ]),
      RERANKER_MODEL: L('Local Reranker (HF)', 'Name of local/HuggingFace reranker model when RERANK_BACKEND=local or hf.'),

      // Retrieval tuning
      MQ_REWRITES: L('Multi-Query Rewrites', 'Generate N paraphrases of the query to broaden recall (then re-rank and fuse). Values 3–6 are typical.'),
      TOPK_DENSE: L('Dense Candidates', 'How many dense (vector) results to fetch before fusion. 60–120 are typical.'),
      TOPK_SPARSE: L('Sparse Candidates', 'How many BM25 (sparse) results to fetch before fusion. 60–120 are typical.', [
        ['BM25S (GitHub)', 'https://github.com/xhluca/bm25s']
      ]),
      FINAL_K: L('Final Top-K', 'Number of results returned after reranking (post‑hydration and bonuses).'),
      HYDRATION_MODE: L('Hydration Mode', 'How code bodies are attached to results. lazy = read only needed chunks; none = skip hydration for speed.'),
      HYDRATION_MAX_CHARS: L('Hydration Max Chars', 'Maximum characters of code to attach per result when hydrating (memory guard).'),

      // Confidence
      CONF_TOP1: L('Confidence Top‑1', 'Threshold for accepting a single top result in the graph loop. Lowering may allow more answers but risks quality.'),
      CONF_AVG5: L('Confidence Avg‑5', 'Threshold for average confidence across top‑5 to continue or rewrite queries.'),
      CONF_ANY: L('Confidence Any', 'Minimum threshold on any candidate to proceed (fallback gating).'),

      // Netlify
      NETLIFY_API_KEY: L('Netlify API Key', 'Key for the netlify_deploy MCP tool to trigger builds.', [
        ['Netlify: Access Tokens', 'https://docs.netlify.com/api/get-started/#access-tokens']
      ]),
      NETLIFY_DOMAINS: L('Netlify Domains', 'Comma‑separated site domains you want to target with the netlify_deploy tool.'),

      // Misc
      THREAD_ID: L('Thread ID', 'Identifier for session state in LangGraph or CLI chat. Use a stable value to preserve memory across runs.', [
        ['CLI Chat Docs', '/docs/CLI_CHAT.md']
      ]),
      TRANSFORMERS_TRUST_REMOTE_CODE: L('Transformers: trust_remote_code', 'Set to true only if you understand the security implications of loading remote model code.', [
        ['Transformers: Security Notes', 'https://huggingface.co/docs/transformers/installation#security-notes']
      ]),
      LANGCHAIN_TRACING_V2: L('LangChain Tracing', 'Enable tracing with LangSmith (Tracing v2).', [
        ['LangSmith Docs', 'https://docs.smith.langchain.com/']
      ]),

      GEN_MODEL_HTTP: L('HTTP Channel Model', 'Override generation model when serving via HTTP channel only.'),
      GEN_MODEL_MCP: L('MCP Channel Model', 'Override generation model when used by MCP only.'),
      GEN_MODEL_CLI: L('CLI Channel Model', 'Override generation model for the CLI chat only.'),

      // Additional providers
      ANTHROPIC_API_KEY: L('Anthropic API Key', 'API key for Anthropic models (Claude family).', [
        ['Anthropic: Getting Started', 'https://docs.anthropic.com/en/api/getting-started']
      ]),
      GOOGLE_API_KEY: L('Google API Key', 'API key for Google Gemini models and endpoints.', [
        ['Gemini: API Keys', 'https://ai.google.dev/gemini-api/docs/api-key']
      ]),
      OPENAI_BASE_URL: L('OpenAI Base URL', 'Override API base URL for OpenAI‑compatible endpoints (advanced).', [
        ['OpenAI Models', 'https://platform.openai.com/docs/models']
      ]),

      // Enrichment / Cards / Indexing
      ENRICH_BACKEND: L('Enrichment Backend', 'Backend used for optional code/context enrichment (e.g., MLX or local workflows).'),
      ENRICH_MODEL: L('Enrichment Model', 'Model used for enrichment when enabled (provider‑specific).'),
      ENRICH_MODEL_OLLAMA: L('Enrichment Model (Ollama)', 'Specific Ollama model to use for enrichment if ENRICH_BACKEND targets Ollama.'),
      CARDS_MAX: L('Cards Max', 'Maximum number of summary cards to consider when boosting retrieval results.', [
        ['Cards Builder (source)', '/files/build_cards.py']
      ]),
      SKIP_DENSE: L('Skip Dense Embeddings', 'When set, indexer skips dense embeddings/Qdrant upsert to build a fast BM25‑only index.'),
      VENDOR_MODE: L('Vendor Mode', 'Bias for first‑party vs vendor‑origin code in reranking. Options: prefer_first_party | prefer_vendor.'),
      EMBEDDING_DIM: L('Embedding Dimension', 'Embedding vector dimension (provider‑specific). For OpenAI and Voyage, this is fixed by the model.'),
      PORT: L('HTTP Port', 'HTTP server port for the GUI/API when running serve_rag.'),
      AGRO_EDITION: L('Edition', 'Product edition flag (oss | pro | enterprise) to toggle advanced features in compatible deployments.'),

      // Repo editor (dynamic inputs)
      repo_path: L('Repository Path', 'Absolute path to a repository that should be indexed for this logical name.'),
      repo_keywords: L('Repository Keywords', 'Keywords that help route queries to this repository during retrieval. Add common terms users will ask for.'),
      repo_pathboosts: L('Path Boosts', 'Directory substrings that should be boosted in ranking for this repository (e.g., app/, api/, server/).'),
      repo_layerbonuses: L('Layer Bonuses', 'Per‑intent layer bonus map to tilt retrieval toward UI/server/integration code as needed.'),
    };
  }

  function attachTooltips(){
    const map = buildTooltipMap();
    const fields = document.querySelectorAll('[name]');
    fields.forEach((field) => {
      const name = field.getAttribute('name');
      const parent = field.closest('.input-group');
      if (!name || !parent) return;
      const label = parent.querySelector('label');
      if (!label) return;
      if (label.querySelector('.help-icon')) return;
      let key = name;
      if (name.startsWith('repo_')) {
        const type = name.split('_')[1];
        key = 'repo_' + type;
      }
      let html = map[key];
      if (!html) {
        html = `<span class=\"tt-title\">${name}</span><div>No detailed tooltip available yet. See our docs for related settings.</div><div class=\"tt-links\"><a href=\"/files/README.md\" target=\"_blank\" rel=\"noopener\">Main README</a> <a href=\"/docs/README.md\" target=\"_blank\" rel=\"noopener\">Docs Index</a></div>`;
      }
      const spanText = document.createElement('span');
      spanText.className = 'label-text';
      spanText.textContent = label.textContent;
      label.textContent = '';
      label.appendChild(spanText);
      const wrap = document.createElement('span');
      wrap.className = 'tooltip-wrap';
      const icon = document.createElement('span');
      icon.className = 'help-icon';
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', `Help: ${name}`);
      icon.textContent = '?';
      const bubble = document.createElement('div');
      bubble.className = 'tooltip-bubble';
      bubble.setAttribute('role', 'tooltip');
      bubble.innerHTML = html;
      wrap.appendChild(icon);
      wrap.appendChild(bubble);
      label.appendChild(wrap);
      function show(){ bubble.classList.add('tooltip-visible'); }
      function hide(){ bubble.classList.remove('tooltip-visible'); }
      icon.addEventListener('mouseenter', show);
      icon.addEventListener('mouseleave', hide);
      icon.addEventListener('focus', show);
      icon.addEventListener('blur', hide);
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        bubble.classList.toggle('tooltip-visible');
      });
      document.addEventListener('click', (evt) => {
        if (!wrap.contains(evt.target)) bubble.classList.remove('tooltip-visible');
      });
    });
  }

  window.Tooltips = { buildTooltipMap, attachTooltips };
})();
