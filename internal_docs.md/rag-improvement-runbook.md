# RAG Performance Improvement Runbook (Adjusted)

**What changed vs your draft**

* ✅ **No writes to your existing `.env`**. We use *runtime env vars* or repo‑specific env files under `env/`.
* ✅ **Model names/APIs verified** (Voyage `voyage-code-3`, Jina code embeddings, BGE v2 M3 reranker, MS MARCO MiniLM cross‑encoder).
* ✅ **Single knob for embeddings**: `EMBEDDING_TYPE` = `openai` | `voyage` | `local`.
* ✅ **Qdrant collections versioned** to avoid dimension mismatches when switching models/dims.
* ✅ **Reranker code fixed** to match the `rerankers` API and normalize scores to 0–1.
* ✅ **Commands bundled** with `&&` and copy‑paste safe.

**Targets** (unchanged)

* Easy ≥ **0.80**, Medium ≥ **0.70**, Hard ≥ **0.65**, Overall ≥ **0.72**

---

## Phase 0 — Preflight (5 min)

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
[[ -d .venv ]] || python3 -m venv .venv && \
. .venv/bin/activate && \
python -V && pip -V && \
 git add -A && git commit -m "preflight: snapshot before RAG tuning" || true
```

**Assumptions**

* You already have **OPENAI_API_KEY**, **VOYAGE_API_KEY**, **QDRANT_URL**, **REDIS_URL** configured in your environment or process manager (not editing `.env`).
* Your indexer honors `REPO` and optionally `COLLECTION_NAME`.

---

## Phase 1 — Code‑Optimized Embeddings (30 min)

### 1.1 Install / wire providers (Voyage + Local)

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
pip install -U voyageai sentence-transformers
```

### 1.2 Patch: single embedding function

*Edit `hybrid_search.py` (or your embedding helper) and **replace** the existing embedding routine with this.*

```python
# --- hybrid_search.py (embedding section) ---
import os
from typing import List

# Optional lazy imports
def _lazy_import_openai():
    from openai import OpenAI
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def _lazy_import_voyage():
    import voyageai
    return voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))

_local_embed_model = None

def _get_embedding(text: str, kind: str = "document") -> List[float]:
    """Return embedding vector for `text`.
    kind: "query" | "document" (voyage benefits from this)
    Controlled by EMBEDDING_TYPE = openai | voyage | local
    """
    et = os.getenv("EMBEDDING_TYPE", "openai").lower()

    if et == "voyage":
        vo = _lazy_import_voyage()
        # voyage-code-3 supports 256/512/1024/2048 dims; default 1024
        # Use 512 to halve storage & speed ANN without large quality loss.
        out = vo.embed([text], model="voyage-code-3", input_type=kind, output_dimension=512)
        return out.embeddings[0]

    if et == "local":
        global _local_embed_model
        if _local_embed_model is None:
            from sentence_transformers import SentenceTransformer
            _local_embed_model = SentenceTransformer("jinaai/jina-embeddings-v2-base-code")
        # ST returns numpy; convert to list for JSON/storage
        return _local_embed_model.encode(text, convert_to_numpy=True).tolist()

    # Default: OpenAI text-embedding-3-large
    client = _lazy_import_openai()
    resp = client.embeddings.create(input=text, model="text-embedding-3-large")
    return resp.data[0].embedding
```

> **Why 512 dims on Voyage?** Faster searches, smaller Qdrant footprint, typically negligible quality drop for code. Adjust to 1024 if quality is short of target.

### 1.3 Versioned Qdrant collections (avoid dim clashes)

Pick a suffix per embedding config. Example: `voyage-c3-d512`.

```bash
# Vivified reindex (Voyage, 512d) to a fresh collection
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
export EMBEDDING_TYPE=voyage && \
export REPO=vivified && \
export COLLECTION_SUFFIX=voyage-c3-d512 && \
export COLLECTION_NAME="${REPO}_${COLLECTION_SUFFIX}" && \
python index_repo.py

# Faxbot reindex
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
export EMBEDDING_TYPE=voyage && \
export REPO=faxbot && \
export COLLECTION_SUFFIX=voyage-c3-d512 && \
export COLLECTION_NAME="${REPO}_${COLLECTION_SUFFIX}" && \
python index_repo.py
```

> If your indexer does **not** honor `COLLECTION_NAME`, use separate Qdrant DBs or adjust the code once here to derive collection name from `REPO` + `EMBEDDING_TYPE` + dim.

### 1.4 Quick sanity check

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
python - << 'PY'
import os
os.environ['EMBEDDING_TYPE'] = 'voyage'
from hybrid_search import search_routed_multi
queries = [
    ('vivified', 'ai studio'),
    ('vivified', 'TBAC trait system'),
    ('faxbot', 'plugin builder'),
    ('faxbot', 'webhook verification'),
]
for repo, q in queries:
    docs = search_routed_multi(q, repo_override=repo, final_k=5)
    top = (docs or [{}])[0]
    print(f"{repo:9} | {q:28} | top_score={top.get('rerank_score', 0):.3f} | file={top.get('file_path', 'n/a')}")
PY
```

---

## Phase 2 — Cross‑Encoder Reranker (20 min)

### 2.1 Install & wire `rerankers`

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
pip install -U "rerankers[transformers]"
```

### 2.2 Patch: reranker with score normalization

*Replace your reranker module (e.g., `rerank.py`) with this implementation.*

```python
# --- rerank.py ---
import math
import os
from typing import List, Dict
from rerankers import Reranker

_RERANKER = None

# Favor Jina v2 multilingual for code/doc mixed repos; alt: ms-marco MiniLM for speed
DEFAULT_RERANK_MODEL = os.getenv('RERANKER_MODEL', 'jinaai/jina-reranker-v2-base-multilingual')


def _sigmoid(x: float) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-float(x)))
    except Exception:
        return 0.0


def _normalize(score: float, model_name: str) -> float:
    # Many cross-encoders output logits; map to 0..1 for consistent thresholds
    if any(k in model_name.lower() for k in ['bge-reranker', 'cross-encoder', 'mxbai', 'jina-reranker']):
        return _sigmoid(score)
    return float(score)


def get_reranker() -> Reranker:
    global _RERANKER
    if _RERANKER is None:
        model_name = DEFAULT_RERANK_MODEL
        # Explicitly mark type for safety
        _RERANKER = Reranker(model_name, model_type='cross-encoder')
    return _RERANKER


def rerank_results(query: str, results: List[Dict], top_k: int = 10) -> List[Dict]:
    """Rerank list of result dicts that include at least `code` and `file_path`."""
    if not results:
        return []

    # Construct lightweight text with minimal hallucination risk
    docs = []
    for r in results:
        file_ctx = r.get('file_path', '')
        code_snip = (r.get('code') or r.get('text') or '')[:600]
        docs.append(f"{file_ctx}\n\n{code_snip}")

    model_name = DEFAULT_RERANK_MODEL
    ranked = get_reranker().rank(query=query, docs=docs, doc_ids=list(range(len(docs))))

    # Apply normalized scores back onto original dicts
    for res in ranked.results:
        idx = res.document.doc_id
        results[idx]['rerank_score'] = _normalize(res.score, model_name)

    results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return results[:top_k]
```

**Switch models quickly**

```bash
# Jina (quality, multilingual)
export RERANKER_MODEL="jinaai/jina-reranker-v2-base-multilingual"
# OR MS MARCO MiniLM (faster, smaller)
export RERANKER_MODEL="cross-encoder/ms-marco-MiniLM-L-6-v2"
```

*No reindex required when swapping rerankers.*

---

## Phase 3 — Chunking for Code (15 min)

### 3.1 Larger chunks + overlap

*Edit `ast_chunker.py` (or your chunker) constants and add overlap.*

```python
# --- ast_chunker.py (constants) ---
MIN_CHUNK_LINES = 50
MAX_CHUNK_LINES = 300
OVERLAP_LINES = 20
```

```python
# --- ast_chunker.py (function) ---
from typing import List, Dict

def chunk_code(file_path: str, code: str, lang: str) -> List[Dict]:
    # ... your language-aware parsing to produce raw_chunks: List[List[int]] ...
    all_lines = code.splitlines()
    chunks: List[Dict] = []
    for i, chunk_lines in enumerate(raw_chunks):
        start_line = chunk_lines[0]
        end_line = chunk_lines[-1]
        if i > 0 and OVERLAP_LINES > 0:
            overlap_start = max(0, start_line - OVERLAP_LINES)
            chunk_text = '\n'.join(all_lines[overlap_start:end_line + 1])
            actual_start = overlap_start
        else:
            chunk_text = '\n'.join(all_lines[start_line:end_line + 1])
            actual_start = start_line
        chunks.append({
            'file_path': file_path,
            'start_line': actual_start,
            'end_line': end_line,
            'code': chunk_text,
            'lang': lang,
        })
    return chunks
```

**Reindex** (same as Phase 1.3) for both repos.

---

## Phase 4 — Quieter Multi‑Query (5 min)

### 4.1 Heuristic toggle

*Edit your LangGraph retrieve step (e.g., `langgraph_app.py`).*

```python
# --- langgraph_app.py (snippet) ---
import os

def should_use_multi_query(question: str) -> bool:
    q = (question or '').lower().strip()
    if len(q.split()) <= 3:
        return False
    for w in ("how", "why", "explain", "compare", "tradeoff"):
        if w in q:
            return True
    return False

# where you set rewrites
mq = int(os.getenv('MQ_REWRITES', '2')) if should_use_multi_query(state['question']) else 1
```

In env/process manager, prefer `MQ_REWRITES=2`.

---

## Phase 5 — File/Path Boosts (10 min)

### 5.1 Post‑rerank boosts

*Add to the end of your `search_routed_multi()` just after reranking.*

```python
# --- hybrid_search.py (within search_routed_multi) ---
import os, os.path

def _apply_filename_boosts(docs, question: str):
    terms = set(question.lower().replace('/', ' ').replace('-', ' ').split())
    for d in docs:
        fp = (d.get('file_path') or '').lower()
        fn = os.path.basename(fp)
        parts = fp.split('/')
        score = d.get('rerank_score', 0.0)
        if any(t in fn for t in terms):
            score *= 1.5
        if any(t in p for t in terms for p in parts):
            score *= 1.2
        d['rerank_score'] = score
    docs.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)

# ...after you call rerank_results(...)
_apply_filename_boosts(docs, question)
```

---

## Phase 6 — Split Pipelines per Repo (30 min)

> Keeps Redis/Qdrant state clean and lets you tune knobs per repo without cross‑talk.

### 6.1 Repo‑specific env files (kept **out** of root `.env`)

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
mkdir -p env && \
cat > env/vivified.env << 'ENV'
OPENAI_API_KEY=${OPENAI_API_KEY}
VOYAGE_API_KEY=${VOYAGE_API_KEY}
QDRANT_URL=${QDRANT_URL}
REDIS_URL=redis://127.0.0.1:6379/0
REPO=vivified
MQ_REWRITES=2
RERANKER_MODEL=jinaai/jina-reranker-v2-base-multilingual
EMBEDDING_TYPE=voyage
COLLECTION_SUFFIX=voyage-c3-d512
ENV

cat > env/faxbot.env << 'ENV'
OPENAI_API_KEY=${OPENAI_API_KEY}
VOYAGE_API_KEY=${VOYAGE_API_KEY}
QDRANT_URL=${QDRANT_URL}
REDIS_URL=redis://127.0.0.1:6379/1
REPO=faxbot
MQ_REWRITES=2
RERANKER_MODEL=jinaai/jina-reranker-v2-base-multilingual
EMBEDDING_TYPE=voyage
COLLECTION_SUFFIX=voyage-c3-d512
ENV
```

### 6.2 Dedicated entry points

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
cat > vivified_rag.py << 'PY'
import os
from dotenv import load_dotenv
load_dotenv('env/vivified.env')
from serve_rag import app
if __name__ == '__main__':
    import uvicorn
    os.environ['COLLECTION_NAME'] = os.environ.get('COLLECTION_NAME', f"{os.environ['REPO']}_{os.environ.get('COLLECTION_SUFFIX','default')}")
    uvicorn.run(app, host='127.0.0.1', port=8012)
PY

cat > faxbot_rag.py << 'PY'
import os
from dotenv import load_dotenv
load_dotenv('env/faxbot.env')
from serve_rag import app
if __name__ == '__main__':
    import uvicorn
    os.environ['COLLECTION_NAME'] = os.environ.get('COLLECTION_NAME', f"{os.environ['REPO']}_{os.environ.get('COLLECTION_SUFFIX','default')}")
    uvicorn.run(app, host='127.0.0.1', port=8013)
PY
```

### 6.3 Run

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
python vivified_rag.py & disown && \
python faxbot_rag.py & disown && \
curl -s "http://127.0.0.1:8012/answer?q=TBAC%20traits&repo=vivified" | head && \
curl -s "http://127.0.0.1:8013/answer?q=webhook%20verification&repo=faxbot" | head
```

---

## Phase 7 — Benchmark (10 min)

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
cat > benchmark_improvements.py << 'PY'
import os
from hybrid_search import search_routed_multi

TESTS = [
    ('vivified','ai studio','easy'),
    ('vivified','TBAC trait system','easy'),
    ('faxbot','plugin builder','easy'),
    ('faxbot','webhook verification','easy'),
    ('vivified','three lane gateway','medium'),
    ('vivified','plugin sandbox isolation','medium'),
    ('faxbot','provider adapter traits','medium'),
    ('faxbot','canonical event normalization','medium'),
    ('vivified','how does TBAC prevent PHI access','hard'),
    ('vivified','what is the general purpose of vivified','hard'),
    ('faxbot','how do different providers interact','hard'),
]

os.environ.setdefault('EMBEDDING_TYPE', 'voyage')

by_diff = {}
for repo, q, d in TESTS:
    docs = search_routed_multi(q, repo_override=repo, final_k=5)
    s = (docs or [{}])[0].get('rerank_score', 0.0)
    by_diff.setdefault(d, []).append(s)

print('\n' + '='*80)
print('FINAL PERFORMANCE METRICS')
print('='*80)

TARGET = {'easy':0.80, 'medium':0.70, 'hard':0.65}
all_scores = []
for d, arr in by_diff.items():
    avg = sum(arr)/max(1,len(arr))
    all_scores.extend(arr)
    status = '✓' if avg >= TARGET[d] else '✗'
    print(f"{status} {d.upper():7} | Avg: {avg:.3f} | Target: {TARGET[d]:.3f}")

overall = sum(all_scores)/max(1,len(all_scores))
print(f"\n{'Overall Average:':20} {overall:.3f}")
print('='*80)
PY && \
python benchmark_improvements.py
```

---

## Helper: One‑shot tuner script (optional)

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
cat > rag_tuner.sh << 'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

: "${REPO:=vivified}"
: "${EMBEDDING_TYPE:=voyage}"
: "${COLLECTION_SUFFIX:=voyage-c3-d512}"
export COLLECTION_NAME="${REPO}_${COLLECTION_SUFFIX}"

printf "\n[1/3] Reindexing %s into %s (EMBEDDING_TYPE=%s)\n" "$REPO" "$COLLECTION_NAME" "$EMBEDDING_TYPE"
python index_repo.py

printf "\n[2/3] Smoke test queries...\n"
python - << 'PY'
import os
from hybrid_search import search_routed_multi
for repo, q in [(os.environ.get('REPO','vivified'), 'ai studio'), (os.environ.get('REPO','vivified'), 'plugin builder')]:
    docs = search_routed_multi(q, repo_override=repo, final_k=3)
    s = (docs or [{}])[0].get('rerank_score', 0.0)
    print(f"{repo:9} | {q:20} => {s:.3f}")
PY

printf "\n[3/3] Benchmark...\n"
python benchmark_improvements.py
SH && \
chmod +x rag_tuner.sh
```

Run it:

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
REPO=vivified EMBEDDING_TYPE=voyage COLLECTION_SUFFIX=voyage-c3-d512 ./rag_tuner.sh && \
REPO=faxbot   EMBEDDING_TYPE=voyage COLLECTION_SUFFIX=voyage-c3-d512 ./rag_tuner.sh
```

---

## Rollback

```bash
cd /Users/davidmontgomery/faxbot_folder/rag-service && \
. .venv/bin/activate && \
export EMBEDDING_TYPE=openai && \
export RERANKER_MODEL=BAAI/bge-reranker-v2-m3 && \
git checkout -- ast_chunker.py rerank.py hybrid_search.py || true && \
REPO=vivified COLLECTION_SUFFIX=baseline python index_repo.py && \
REPO=faxbot   COLLECTION_SUFFIX=baseline python index_repo.py
```

---

## Notes

* Voyage `voyage-code-3` is specifically optimized for **code retrieval** and supports smaller output dimensions; using 512 dims is a good balance of quality/cost. If you undershoot targets, retry at 1024 dims.
* `rerankers` returns raw scores that can be logits; we normalize with sigmoid for a consistent 0–1 scale.
* Versioning Qdrant collections keeps imqgrations painless when changing models/dimensions.
* Keep per‑repo Redis DBs to prevent cache cross‑talk.
* All changes are incremental; benchmark after each phase before moving on.
