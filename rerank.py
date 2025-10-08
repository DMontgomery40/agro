import math
import os
from typing import List, Dict
from rerankers import Reranker
from typing import Optional

_HF_PIPE = None  # optional transformers pipeline for models that require trust_remote_code

_RERANKER = None

DEFAULT_MODEL = os.getenv('RERANKER_MODEL', 'cross-encoder/ms-marco-MiniLM-L-6-v2')


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
            # Use HF pipeline directly to guarantee trust_remote_code is honored
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
        # First try a direct HF pipeline for models with custom code
        if _maybe_init_hf_pipeline(model_name):
            return None  # Signal to use HF pipeline path
        # Otherwise, fall back to rerankers
        os.environ.setdefault('TRANSFORMERS_TRUST_REMOTE_CODE', '1')
        _RERANKER = Reranker(model_name, model_type='cross-encoder', trust_remote_code=True)
    return _RERANKER


def rerank_results(query: str, results: List[Dict], top_k: int = 10) -> List[Dict]:
    if not results:
        return []
    model_name = DEFAULT_MODEL
    # HF pipeline path (e.g., Jina reranker)
    pipe = _maybe_init_hf_pipeline(model_name)
    if pipe is not None:
        pairs = []
        for r in results:
            code_snip = (r.get('code') or r.get('text') or '')[:700]
            pairs.append({'text': query, 'text_pair': code_snip})
        try:
            out = pipe(pairs, truncation=True)
            for i, o in enumerate(out):
                score = float(o.get('score', 0.0))
                results[i]['rerank_score'] = score
            results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
            return results[:top_k]
        except Exception:
            # Fall back to rerankers path below
            pass
    # rerankers path
    docs = []
    for r in results:
        file_ctx = r.get('file_path', '')
        code_snip = (r.get('code') or r.get('text') or '')[:600]
        docs.append(f"{file_ctx}\n\n{code_snip}")
    rr = get_reranker()
    if rr is None and _maybe_init_hf_pipeline(model_name) is not None:
        # HF pipeline already used above; should not reach here
        return results[:top_k]
    ranked = rr.rank(query=query, docs=docs, doc_ids=list(range(len(docs))))
    for res in ranked.results:
        idx = res.document.doc_id
        results[idx]['rerank_score'] = _normalize(res.score, model_name)
    results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return results[:top_k]
