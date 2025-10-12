from __future__ import annotations

from typing import Dict, Any


def enrich(code: str, backend: str | None = None) -> Dict[str, Any]:
    """Best-effort metadata enrichment stub used by indexers.

    In production you can route to MLX/Ollama or any local pipeline.
    """
    backend = (backend or "none").lower()
    summary = (code or "").splitlines()[:4]
    return {
        "summary": " ".join(x.strip() for x in summary if x.strip())[:240],
        "keywords": [],
        "backend": backend,
    }

