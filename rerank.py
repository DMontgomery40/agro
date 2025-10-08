import math
import os
from typing import List, Dict
from rerankers import Reranker

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


def get_reranker() -> Reranker:
    global _RERANKER
    if _RERANKER is None:
        model_name = DEFAULT_MODEL
        _RERANKER = Reranker(model_name, model_type='cross-encoder', trust_remote_code=True)
    return _RERANKER


def rerank_results(query: str, results: List[Dict], top_k: int = 10) -> List[Dict]:
    if not results:
        return []
    docs = []
    for r in results:
        file_ctx = r.get('file_path', '')
        code_snip = (r.get('code') or r.get('text') or '')[:600]
        docs.append(f"{file_ctx}\n\n{code_snip}")
    model_name = DEFAULT_MODEL
    ranked = get_reranker().rank(query=query, docs=docs, doc_ids=list(range(len(docs))))
    for res in ranked.results:
        idx = res.document.doc_id
        results[idx]['rerank_score'] = _normalize(res.score, model_name)
    results.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return results[:top_k]
