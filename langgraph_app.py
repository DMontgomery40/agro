import os, operator
from typing import List, Dict, TypedDict, Annotated
from dotenv import load_dotenv
from langgraph.graph import END, StateGraph
from langgraph.checkpoint.redis import RedisSaver
from hybrid_search import search_routed_multi as hybrid_search_routed_multi
from openai import OpenAI

load_dotenv()
top_env = '/Users/davidmontgomery/rag-service/.env'
if os.path.exists(top_env):
    try:
        load_dotenv(dotenv_path=top_env, override=False)
    except Exception:
        pass

class RAGState(TypedDict):
    question: str
    documents: Annotated[List[Dict], operator.add]
    generation: str
    iteration: int
    confidence: float
    repo: str

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def retrieve_node(state: RAGState) -> Dict:
    q = state['question']
    repo = state.get('repo') if isinstance(state, dict) else None
    docs = hybrid_search_routed_multi(q, repo_override=repo, m=int(os.getenv('MQ_REWRITES','4')), final_k=20)
    conf = float(sum(d.get('rerank_score',0.0) for d in docs)/max(1,len(docs)))
    return {'documents': docs, 'confidence': conf, 'iteration': state.get('iteration',0)+1}



def route_after_retrieval(state:RAGState)->str:
    conf = float(state.get("confidence", 0.0) or 0.0)
    it = int(state.get("iteration", 0) or 0)
    docs = state.get("documents", []) or []
    scores = sorted([float(d.get("rerank_score",0.0) or 0.0) for d in docs], reverse=True)
    top1 = scores[0] if scores else 0.0
    avg5 = (sum(scores[:5])/min(5, len(scores))) if scores else 0.0
    if top1 >= 0.62 or avg5 >= 0.55 or conf >= 0.55:
        return "generate"
    if it >= 3:
        return "fallback"
    return "rewrite_query"

def rewrite_query(state: RAGState) -> Dict:
    q = state['question']
    prompt = f"Rewrite this developer question to be maximally searchable against code (expand CamelCase, add likely API names) without changing meaning.\n\n{q}\n\nRewritten:"
    r = client.chat.completions.create(model='gpt-4o-mini', messages=[{'role':'user','content':prompt}], temperature=0.2)
    newq = r.choices[0].message.content.strip()
    return {'question': newq}

def generate_node(state: RAGState) -> Dict:
    q = state['question']; ctx = state['documents'][:5]
    citations = "\n".join([f"- {d['file_path']}:{d['start_line']}-{d['end_line']}" for d in ctx])
    context_text = "\n\n".join([d.get('code','') for d in ctx])
    sys = 'You answer strictly from the provided code context. Always cite file paths and line ranges you used.'
    user = f"Question:\n{q}\n\nContext:\n{context_text}\n\nCitations (paths and line ranges):\n{citations}\n\nAnswer:"
    r = client.chat.completions.create(model='gpt-4o-mini', messages=[{'role':'system','content':sys},{'role':'user','content':user}], temperature=0.2)
    content = r.choices[0].message.content
    # Lightweight verifier: if confidence low, try multi-query retrieval and regenerate once
    conf = float(state.get('confidence', 0.0) or 0.0)
    if conf < 0.55:
        repo = state.get('repo') or os.getenv('REPO','vivified')
        alt_docs = hybrid_search_routed_multi(q, repo_override=repo, m=4, final_k=10)
        if alt_docs:
            ctx2 = alt_docs[:5]
            citations2 = "\n".join([f"- {d['file_path']}:{d['start_line']}-{d['end_line']}" for d in ctx2])
            context_text2 = "\n\n".join([d.get('code','') for d in ctx2])
            user2 = f"Question:\n{q}\n\nContext:\n{context_text2}\n\nCitations (paths and line ranges):\n{citations2}\n\nAnswer:"
            r2 = client.chat.completions.create(model='gpt-4o-mini', messages=[{'role':'system','content':sys},{'role':'user','content':user2}], temperature=0.2)
            content = r2.choices[0].message.content
    repo = state.get('repo') or os.getenv('REPO','vivified')
    header = f"[repo: {repo}]"
    return {'generation': header + "\n" + content}

def fallback_node(state: RAGState) -> Dict:
    repo = state.get('repo') or os.getenv('REPO','vivified')
    header = f"[repo: {repo}]"
    msg = "I don't have high confidence from local code. Try refining the question or expanding the context."
    return {'generation': header + "\n" + msg}

def build_graph():
    builder = StateGraph(RAGState)
    builder.add_node('retrieve', retrieve_node)
    builder.add_node('rewrite_query', rewrite_query)
    builder.add_node('generate', generate_node)
    builder.add_node('fallback', fallback_node)
    builder.set_entry_point('retrieve')
    builder.add_conditional_edges('retrieve', route_after_retrieval, {
        'generate': 'generate', 'rewrite_query': 'rewrite_query', 'fallback': 'fallback'
    })
    builder.add_edge('rewrite_query', 'retrieve')
    builder.add_edge('generate', END)
    builder.add_edge('fallback', END)
    DB_URI = os.getenv('REDIS_URL','redis://127.0.0.1:6379/0')
    # Instantiate directly (from_conn_string returns a context manager in this langgraph version)
    checkpointer = RedisSaver(redis_url=DB_URI)
    graph = builder.compile(checkpointer=checkpointer)
    return graph

if __name__ == '__main__':
    import sys
    q = ' '.join(sys.argv[1:]) if len(sys.argv)>1 else 'Where is OAuth token validated?'
    graph = build_graph(); cfg = {'configurable': {'thread_id': 'dev'}}
    res = graph.invoke({'question': q, 'documents': [], 'generation':'', 'iteration':0, 'confidence':0.0}, cfg)
    print(res['generation'])
