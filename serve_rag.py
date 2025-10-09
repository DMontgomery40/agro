from fastapi import FastAPI, Query
from pydantic import BaseModel
from typing import Optional
from langgraph_app import build_graph
from hybrid_search import search_routed_multi

app = FastAPI(title="PROJECT/PROJECT RAG")

_graph = None
def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph

CFG = {"configurable": {"thread_id": "http"}}

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
    repo: Optional[str] = Query(None, description="Repository override: project|faxbot")
):
    """Answer a question using strict per-repo routing.

    If `repo` is provided, retrieval and the answer header will use that repo.
    Otherwise, a lightweight router selects the repo from the query content.
    """
    g = get_graph()
    state = {"question": q, "documents": [], "generation":"", "iteration":0, "confidence":0.0, "repo": (repo.strip() if repo else None)}
    res = g.invoke(state, CFG)
    return {"answer": res["generation"]}

@app.get("/search")
def search(
    q: str = Query(..., description="Question"),
    repo: Optional[str] = Query(None, description="Repository override: project|faxbot"),
    top_k: int = Query(10, description="Number of results to return")
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
