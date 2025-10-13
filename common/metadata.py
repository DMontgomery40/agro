from __future__ import annotations

from typing import Dict, Any


def enrich(file_path: str, lang: str, code: str) -> Dict[str, Any]:
    """Best-effort metadata enrichment stub used by indexers.

    In production you can route to MLX/Ollama or any local pipeline.
    
    Args:
        file_path: Path to the file being enriched
        lang: Language/extension (e.g., 'py', 'ts', 'js')
        code: Source code content
    """
    summary = (code or "").splitlines()[:4]
    return {
        "summary": " ".join(x.strip() for x in summary if x.strip())[:240],
        "keywords": [],
        "file_path": file_path,
        "lang": lang,
    }

