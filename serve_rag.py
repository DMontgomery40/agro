import os
from fastapi import FastAPI, Query, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from langgraph_app import build_graph
from hybrid_search import search_routed_multi
from config_loader import list_repos, get_default_repo

app = FastAPI(title="RAG Service")

_graph = None
def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph

CFG = {"configurable": {"thread_id": "http"}}

# --- Optional OAuth (Bearer) gate, off by default ---
_OAUTH_ENABLED = (os.getenv("OAUTH_ENABLED", "false") or "false").lower() == "true"
_OAUTH_TOKEN = os.getenv("OAUTH_TOKEN", "")
_bearer = HTTPBearer(auto_error=False)

def verify_auth(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if not _OAUTH_ENABLED:
        return None
    if not creds or not creds.scheme.lower() == "bearer" or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    tok = creds.credentials.strip()
    if _OAUTH_TOKEN and tok != _OAUTH_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return None

class Answer(BaseModel):
    answer: str

@app.get("/health")
def health():
    try:
        g = get_graph()
        return {"status": "healthy", "graph_loaded": g is not None}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/answer", response_model=Answer)
def answer(
    q: str = Query(..., description="Question"),
    repo: Optional[str] = Query(None, description="Repository override: configured repo name"),
    _auth=Depends(verify_auth)
):
    """Answer a question using strict per-repo routing.

    If `repo` is provided, retrieval and the answer header will use that repo.
    Otherwise, a lightweight router selects the repo from the query content.
    """
    g = get_graph()
    # Validate repo if provided
    repo_clean = (repo.strip() if repo else None)
    if repo_clean and repo_clean not in list_repos():
        # If unknown, fall back to default to avoid hard failures
        repo_clean = get_default_repo()
    state = {"question": q, "documents": [], "generation":"", "iteration":0, "confidence":0.0, "repo": repo_clean}
    res = g.invoke(state, CFG)
    return {"answer": res["generation"]}

@app.get("/search")
def search(
    q: str = Query(..., description="Question"),
    repo: Optional[str] = Query(None, description="Repository override: configured repo name"),
    top_k: int = Query(10, description="Number of results to return"),
    _auth=Depends(verify_auth)
):
    """Search for relevant code locations without generation.

    Returns file paths, line ranges, and rerank scores for the most relevant code chunks.
    """
    docs = search_routed_multi(q, repo_override=repo, m=4, final_k=top_k)
    results = [
        {
            "file_path": d.get("file_path", ""),
            "start_line": d.get("start_line", 0),
            "end_line": d.get("end_line", 0),
            "language": d.get("language", ""),
            "rerank_score": float(d.get("rerank_score", 0.0) or 0.0),
            "repo": d.get("repo", repo),
        }
        for d in docs
    ]
    return {"results": results, "repo": repo, "count": len(results)}


# --- Optional SSE streaming (off by default; separate endpoint) ---

def _sse_format(data: str) -> str:
    # Basic SSE event format
    return f"data: {data}\n\n"


@app.get("/answer_stream")
def answer_stream(
    q: str = Query(..., description="Question"),
    repo: Optional[str] = Query(None, description="Repository override: configured repo name"),
    _auth=Depends(verify_auth)
):
    """Stream an answer over SSE. Does not change /answer behavior."""
    g = get_graph()

    repo_clean = (repo.strip() if repo else None)
    if repo_clean and repo_clean not in list_repos():
        repo_clean = get_default_repo()

    def gen():
        try:
            state = {"question": q, "documents": [], "generation":"", "iteration":0, "confidence":0.0, "repo": repo_clean}
            res = g.invoke(state, CFG)
            text = (res.get("generation") or "")
            # Stream in chunks to avoid buffering
            chunk = 120
            for i in range(0, len(text), chunk):
                yield _sse_format(text[i:i+chunk])
            yield _sse_format("[DONE]")
        except Exception as e:
            yield _sse_format(f"[ERROR] {str(e)}")

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream; charset=utf-8",
    }
    return StreamingResponse(gen(), headers=headers, media_type="text/event-stream")
