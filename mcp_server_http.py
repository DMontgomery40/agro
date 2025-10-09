from __future__ import annotations
import os, json
from typing import Literal, Dict, Any

from fastmcp import FastMCP

# Reuse internal pipeline
from langgraph_app import build_graph
from hybrid_search import search_routed_multi


mcp = FastMCP("rag-service")
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


@mcp.tool()
def answer(repo: Literal["vivified", "faxbot"], question: str) -> Dict[str, Any]:
    """Answer a codebase question using local LangGraph (retrieval+generation). Returns text + citations."""
    g = _get_graph()
    cfg = {"configurable": {"thread_id": f"http-{repo}"}}
    state = {
        "question": question,
        "documents": [],
        "generation": "",
        "iteration": 0,
        "confidence": 0.0,
        "repo": repo,
    }
    res = g.invoke(state, cfg)
    docs = res.get("documents", [])[:5]
    citations = [f"{d['file_path']}:{d['start_line']}-{d['end_line']}" for d in docs]
    return {
        "answer": res.get("generation", ""),
        "citations": citations,
        "repo": res.get("repo", repo),
        "confidence": float(res.get("confidence", 0.0) or 0.0),
    }


@mcp.tool()
def search(repo: Literal["vivified", "faxbot"], question: str, top_k: int = 10) -> Dict[str, Any]:
    """Retrieve relevant code locations without generation."""
    docs = search_routed_multi(question, repo_override=repo, m=4, final_k=top_k)
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


if __name__ == "__main__":
    # Serve over HTTP for remote MCP (platform evals). Use env overrides for host/port/path.
    host = os.getenv("MCP_HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_HTTP_PORT", "8013"))
    path = os.getenv("MCP_HTTP_PATH", "/mcp")
    mcp.run(transport="http", host=host, port=port, path=path)
