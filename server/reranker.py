import os
import math
from typing import List, Dict, Any, Optional
from sentence_transformers import CrossEncoder

_RERANKER = None

def get_reranker() -> CrossEncoder:
    """Lazy-load the cross-encoder reranker model.
    
    Uses AGRO_RERANKER_MODEL_PATH env var to specify model path,
    defaults to ms-marco-MiniLM-L-6-v2 for fast CPU inference.
    """
    global _RERANKER
    if _RERANKER is None:
        path = os.getenv("AGRO_RERANKER_MODEL_PATH", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        max_len = int(os.getenv("AGRO_RERANKER_MAXLEN", "512"))
        _RERANKER = CrossEncoder(path, max_length=max_len)
    return _RERANKER

def _minmax(scores: List[float]) -> List[float]:
    """Min-max normalize scores to [0, 1] range."""
    if not scores:
        return []
    mn, mx = min(scores), max(scores)
    if math.isclose(mn, mx):  # avoid div/0
        return [0.5 for _ in scores]
    return [(s - mn) / (mx - mn) for s in scores]

def rerank_candidates(
    query: str,
    candidates: List[Dict[str, Any]],
    blend_alpha: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Rerank candidates using cross-encoder and blend with original scores.
    
    Args:
        query: The search query
        candidates: List of dicts with keys: doc_id, score, text, clicked
        blend_alpha: Weight for cross-encoder score (None uses env AGRO_RERANKER_ALPHA)
        
    Returns:
        Reranked candidates sorted by blended score, with added fields:
        - rerank_score: Final blended score
        - cross_encoder_score: Raw cross-encoder score
        - base_score_norm: Normalized original score
    """
    if blend_alpha is None:
        blend_alpha = float(os.getenv("AGRO_RERANKER_ALPHA", "0.7"))
    
    # If no text, we cannot rerank — return as-is
    if not candidates or "text" not in candidates[0]:
        return candidates

    model = get_reranker()
    pairs = [(query, c["text"]) for c in candidates]
    batch_size = int(os.getenv("AGRO_RERANKER_BATCH", "16"))
    ce_scores = model.predict(pairs, batch_size=batch_size)
    
    base_scores = [c.get("score", 0.0) for c in candidates]
    base_norm = _minmax(base_scores)

    reranked = []
    for c, ce, bn in zip(candidates, ce_scores, base_norm):
        blended = (blend_alpha * float(ce)) + ((1.0 - blend_alpha) * float(bn))
        item = dict(c)
        item["rerank_score"] = blended
        item["cross_encoder_score"] = float(ce)
        item["base_score_norm"] = float(bn)
        reranked.append(item)
    
    reranked.sort(key=lambda x: x["rerank_score"], reverse=True)
    return reranked

