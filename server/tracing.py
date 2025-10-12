import os
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from contextvars import ContextVar

from common.config_loader import out_dir


_TRACE_VAR: ContextVar[Optional["Trace"]] = ContextVar("agro_trace", default=None)


def _now_iso() -> str:
    return __import__("datetime").datetime.utcnow().isoformat() + "Z"


class Trace:
    """Lightweight per-request trace recorder.

    - Stores structured breadcrumb events in-memory
    - Persists to out/<repo>/traces/<ts>_<id>.json on save()
    - Enabled when LANGCHAIN_TRACING_V2 is truthy (1/true/on)
    """

    def __init__(self, repo: str, question: str):
        self.repo = (repo or os.getenv("REPO", "agro")).strip()
        self.question = question
        self.id = uuid.uuid4().hex[:8]
        self.started_at = _now_iso()
        self.events: List[Dict[str, Any]] = []
        self.path: Optional[str] = None

    # ---- control ----
    @staticmethod
    def enabled() -> bool:
        v = (os.getenv("LANGCHAIN_TRACING_V2", "0") or "0").strip().lower()
        return v in {"1", "true", "on", "yes"}

    def add(self, kind: str, payload: Dict[str, Any]) -> None:
        try:
            self.events.append({
                "ts": _now_iso(),
                "kind": str(kind),
                "data": payload or {},
            })
        except Exception:
            # tracing should never break request flow
            pass

    def _dir(self) -> Path:
        base = Path(out_dir(self.repo))
        d = base / "traces"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save(self) -> str:
        try:
            ts_short = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
            out_path = self._dir() / f"{ts_short}_{self.id}.json"
            data = {
                "repo": self.repo,
                "id": self.id,
                "question": self.question,
                "started_at": self.started_at,
                "finished_at": _now_iso(),
                "events": self.events,
            }
            out_path.write_text(json.dumps(data, indent=2))
            self.path = str(out_path)
            return self.path
        except Exception:
            return ""


# ---- context helpers ----
def start_trace(repo: str, question: str) -> Trace:
    tr = Trace(repo=repo, question=question)
    _TRACE_VAR.set(tr)
    return tr


def get_trace() -> Optional[Trace]:
    return _TRACE_VAR.get()


def end_trace() -> Optional[str]:
    tr = _TRACE_VAR.get()
    if tr is None:
        return None
    path = tr.save()
    _TRACE_VAR.set(None)
    return path


def latest_trace_path(repo: str) -> Optional[str]:
    try:
        d = Path(out_dir(repo)) / "traces"
        if not d.exists():
            return None
        files = sorted([p for p in d.glob("*.json") if p.is_file()], key=lambda p: p.stat().st_mtime, reverse=True)
        return str(files[0]) if files else None
    except Exception:
        return None
