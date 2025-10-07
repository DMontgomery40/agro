from fastapi import FastAPI, Query
from pydantic import BaseModel
from typing import Optional
from langgraph_app import build_graph

app = FastAPI(title="Faxbot/Vivified RAG")

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
def answer(q: str = Query(..., description="Question")):
    g = get_graph()
    state = {"question": q, "documents": [], "generation":"", "iteration":0, "confidence":0.0}
    res = g.invoke(state, CFG)
    return {"answer": res["generation"]}
