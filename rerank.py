import os
from typing import List, Dict
import torch
from sentence_transformers import CrossEncoder
from dotenv import load_dotenv
load_dotenv()

_DEVICE = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
_MODEL = os.getenv('RERANKER_MODEL','BAAI/bge-reranker-v2-m3')
_BATCH = 16 if _DEVICE == 'mps' else 32
_ce = CrossEncoder(_MODEL, max_length=512, device=_DEVICE)

def rerank(query: str, docs: List[Dict], top_k: int = 10) -> List[Dict]:
    if not docs: return []
    pairs = [(query, d.get('code','')[:2048]) for d in docs]
    scores = _ce.predict(pairs, batch_size=_BATCH, show_progress_bar=False)
    import numpy as np
    sig = 1/(1+np.exp(-scores))
    ranked = sorted(zip(docs, sig.tolist()), key=lambda x: x[1], reverse=True)
    out = []
    for d, s in ranked[:top_k]:
        dd = dict(d); dd['rerank_score'] = float(s); out.append(dd)
    return out
