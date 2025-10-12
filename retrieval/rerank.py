@@
import math
import os
from typing import List, Dict
from rerankers import Reranker
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except Exception:
    pass

_HF_PIPE = None
_RERANKER = None

DEFAULT_MODEL = os.getenv('RERANKER_MODEL', 'BAAI/bge-reranker-v2-m3')
RERANK_BACKEND = (os.getenv('RERANK_BACKEND', 'local') or 'local').lower()
COHERE_MODEL = os.getenv('COHERE_RERANK_MODEL', 'rerank-3.5')

def _sigmoid(x: float) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-float(x)))
    except Exception:
        return 0.0

def _normalize(score: float, model_name: str) -> float:
    if any(k in model_name.lower() for k in ['bge-reranker', 'cross-encoder', 'mxbai', 'jina-reranker']):
        return _sigmoid(score)
    return float(score)

def _maybe_init_hf_pipeline(model_name: str) -> Optional[object]:
    global _HF_PIPE
    if _HF_PIPE is not None:
        return _HF_PIPE
    try:
        if 'jinaai/jina-reranker' in model_name.lower():
            os.environ.setdefault('TRANSFORMERS_TRUST_REMOTE_CODE', '1')
            from transformers import pipeline
            _HF_PIPE = pipeline(
                task='text-classification',
                model=model_name,
                tokenizer=model_name,
                trust_remote_code=True,
                device_map='auto'
            )
            return _HF_PIPE
    except Exception:
        _HF_PIPE = None
    return _HF_PIPE

def get_reranker() -> Reranker:
    global _RERANKER
    if _RERANKER is None:
        model_name = DEFAULT_MODEL
        if _maybe_init_hf_pipeline(model_name):
            return None
        os.environ.setdefault('TRANSFORMERS_TRUST_REMOTE_CODE', '1')
        _RERANKER = Reranker(model_name, model_type='cross-encoder', trust_remote_code=True)
    return _RERANKER

def rerank_results(query: str, results: List[Dict], top_k: int = 10) -> List[Dict]:
    if not results:
        return []
    if RERANK_BACKEND in ('none', 'off', 'disabled'):
        for i, r in enumerate(results):
            r['rerank_score'] = float(1.0 - (i * 0.01))
        return results[:top_k]
    model_name = DEFAULT_MODEL
    if RERANK_BACKEND == 'cohere':
        try:
            import cohere
            api_key = os.getenv('COHERE_API_KEY')
            if not api_key:
                raise RuntimeError('COHERE_API_KEY not set')
            client = cohere.Client(api_key=api_key)
            docs = []
            for r in results:
                file_ctx = r.get('file_path', '')
                code_snip = (r.get('code') or r.get('text') or '')[:700]
                docs.append(f"{file_ctx}\n\n{code_snip}")
            rr = client.rerank(model=COHERE_MODEL, query=query, documents=docs, top_n=len(docs))
            scores = [getattr(x, 'relevance_score', 0.0) for x in rr.results]
            max_s = max(scores) if scores else 1.0
            for item in rr.results:
                idx = int(getattr(item, 'index', 0))
                score = float(getattr(item, 'relevance_score', 0.0))
                results[idx]['rerank_score'] = (score / max_s) if max_s else 0.0
            results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
            return results[:top_k]
        except Exception:
            pass
    pipe = _maybe_init_hf_pipeline(model_name)
    if pipe is not None:
        pairs = []
        for r in results:
            code_snip = (r.get('code') or r.get('text') or '')[:700]
            pairs.append({'text': query, 'text_pair': code_snip})
        try:
            out = pipe(pairs, truncation=True)
            raw = []
            for i, o in enumerate(out):
                score = float(o.get('score', 0.0))
                s = _normalize(score, model_name)
                results[i]['rerank_score'] = s
                raw.append(s)
            if raw:
                mn, mx = min(raw), max(raw)
                rng = (mx - mn)
                if rng > 1e-9:
                    for r in results:
                        r['rerank_score'] = (float(r.get('rerank_score', 0.0)) - mn) / rng
                elif mx != 0.0:
                    for r in results:
                        r['rerank_score'] = float(r.get('rerank_score', 0.0)) / abs(mx)
            results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
            return results[:top_k]
        except Exception:
            pass
    docs = []
    for r in results:
        file_ctx = r.get('file_path', '')
        code_snip = (r.get('code') or r.get('text') or '')[:600]
        docs.append(f"{file_ctx}\n\n{code_snip}")
    rr = get_reranker()
    if rr is None and _maybe_init_hf_pipeline(model_name) is not None:
        return results[:top_k]
    ranked = rr.rank(query=query, docs=docs, doc_ids=list(range(len(docs))))
    raw_scores = []
    for res in ranked.results:
        idx = res.document.doc_id
        s = _normalize(res.score, model_name)
        results[idx]['rerank_score'] = s
        raw_scores.append(s)
    if raw_scores:
        mn, mx = min(raw_scores), max(raw_scores)
        rng = (mx - mn)
        if rng > 1e-9:
            for r in results:
                r['rerank_score'] = (float(r.get('rerank_score', 0.0)) - mn) / rng
        elif mx != 0.0:
            for r in results:
                r['rerank_score'] = float(r.get('rerank_score', 0.0)) / abs(mx)
    results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return results[:top_k]

