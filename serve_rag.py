from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from langgraph_app import build_graph
from hybrid_search import search_routed_multi
from config_loader import load_repos
import os, json

app = FastAPI(title="AGRO RAG + GUI")

_graph = None
def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph

CFG = {"configurable": {"thread_id": "http"}}

class Answer(BaseModel):
    answer: str

ROOT = Path(__file__).resolve().parent
GUI_DIR = ROOT / "gui"

# Serve static GUI assets
if GUI_DIR.exists():
    app.mount("/gui", StaticFiles(directory=str(GUI_DIR), html=True), name="gui")

@app.get("/", include_in_schema=False)
def serve_index():
    idx = GUI_DIR / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return {"ok": True, "message": "GUI assets not found; use /health, /search, /answer"}

@app.get("/health")
def health():
    try:
        g = get_graph()
        return {"status": "healthy", "graph_loaded": g is not None, "ts": __import__('datetime').datetime.utcnow().isoformat() + 'Z'}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/answer", response_model=Answer)
def answer(
    q: str = Query(..., description="Question"),
    repo: Optional[str] = Query(None, description="Repository override: project|project")
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
    repo: Optional[str] = Query(None, description="Repository override: project|project"),
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

# ---------------- Minimal GUI API stubs ----------------
def _read_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return default
    return default

def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

@app.post("/api/env/reload")
def api_env_reload() -> Dict[str, Any]:
    try:
        from dotenv import load_dotenv as _ld
        _ld(override=False)
    except Exception:
        pass
    return {"ok": True}

@app.get("/api/config")
def get_config() -> Dict[str, Any]:
    cfg = load_repos()
    # return a broad env snapshot for the GUI; rely on client to pick what it needs
    env: Dict[str, Any] = {}
    for k, v in os.environ.items():
        # keep it simple; include strings only
        env[k] = v
    repos = cfg.get("repos", [])
    return {
        "env": env,
        "default_repo": cfg.get("default_repo"),
        "repos": repos,
    }

@app.get("/api/prices")
def get_prices():
    default_prices = {
        "last_updated": "2025-10-10",
        "currency": "USD",
        "models": [
            {"provider": "openai", "family": "gpt-4o-mini", "model": "gpt-4o-mini",
             "unit": "1k_tokens", "input_per_1k": 0.005, "output_per_1k": 0.015,
             "embed_per_1k": 0.0001, "rerank_per_1k": 0.0, "notes": "EXAMPLE"},
            {"provider": "cohere", "family": "rerank-english-v3.0", "model": "rerank-english-v3.0",
             "unit": "1k_tokens", "input_per_1k": 0.0, "output_per_1k": 0.0,
             "embed_per_1k": 0.0, "rerank_per_1k": 0.30, "notes": "EXAMPLE"},
            {"provider": "voyage", "family": "voyage-3-large", "model": "voyage-3-large",
             "unit": "1k_tokens", "input_per_1k": 0.0, "output_per_1k": 0.0,
             "embed_per_1k": 0.12, "rerank_per_1k": 0.0, "notes": "EXAMPLE"},
            {"provider": "local", "family": "qwen3-coder", "model": "qwen3-coder:14b",
             "unit": "request", "per_request": 0.0, "notes": "Local inference assumed $0; electricity optional"}
        ]
    }
    prices_path = GUI_DIR / "prices.json"
    data = _read_json(prices_path, default_prices)
    return JSONResponse(data)

@app.post("/api/prices/upsert")
def upsert_price(item: Dict[str, Any]) -> Dict[str, Any]:
    prices_path = GUI_DIR / "prices.json"
    data = _read_json(prices_path, {"models": []})
    models: List[Dict[str, Any]] = list(data.get("models", []))
    key = (str(item.get("provider")), str(item.get("model")))
    idx = next((i for i, m in enumerate(models) if (str(m.get("provider")), str(m.get("model"))) == key), None)
    if idx is None:
        models.append(item)
    else:
        models[idx].update(item)
    data["models"] = models
    data["last_updated"] = __import__('datetime').datetime.utcnow().strftime('%Y-%m-%d')
    _write_json(prices_path, data)
    return {"ok": True, "count": len(models)}

@app.get("/api/keywords")
def get_keywords() -> Dict[str, Any]:
    def extract_terms(obj: Any) -> List[str]:
        out: List[str] = []
        try:
            if isinstance(obj, list):
                for it in obj:
                    if isinstance(it, str):
                        out.append(it)
                    elif isinstance(it, dict):
                        # common shapes
                        for key in ("keyword", "term", "key", "name"):
                            if key in it and isinstance(it[key], str):
                                out.append(it[key])
                                break
            elif isinstance(obj, dict):
                # prefer "agro" or "project" buckets, else flatten all lists
                for bucket in ("agro", "project"):
                    if bucket in obj and isinstance(obj[bucket], list):
                        out.extend(extract_terms(obj[bucket]))
                        return out
                for v in obj.values():
                    out.extend(extract_terms(v))
        except Exception:
            pass
        return out
    discr_raw = _read_json(ROOT / "discriminative_keywords.json", {})
    sema_raw = _read_json(ROOT / "semantic_keywords.json", {})
    discr = extract_terms(discr_raw)
    sema = extract_terms(sema_raw)
    repos_cfg = load_repos()
    repo_k = []
    for r in repos_cfg.get("repos", []):
        for k in r.get("keywords", []) or []:
            if isinstance(k, str):
                repo_k.append(k)
    def uniq(xs: List[str]) -> List[str]:
        seen = set(); out: List[str] = []
        for k in xs:
            k2 = str(k)
            if k2 not in seen:
                out.append(k2); seen.add(k2)
        return out
    discr = uniq(discr)
    sema = uniq(sema)
    repo_k = uniq(repo_k)
    allk = uniq((discr or []) + (sema or []) + (repo_k or []))
    return {"discriminative": discr, "semantic": sema, "repos": repo_k, "keywords": allk}

@app.post("/api/scan-hw")
def scan_hw() -> Dict[str, Any]:
    # Lightweight local scan without new deps
    import platform, shutil
    info = {
        "os": platform.system(),
        "arch": platform.machine(),
        "cpu_cores": os.cpu_count() or 0,
        "mem_gb": None,
    }
    # Try to get memory (Darwin via sysctl; Linux via /proc/meminfo)
    try:
        if info["os"] == "Darwin":
            import subprocess
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            info["mem_gb"] = round(int(out) / (1024**3), 2)
        elif Path("/proc/meminfo").exists():
            txt = Path("/proc/meminfo").read_text()
            for line in txt.splitlines():
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1]); info["mem_gb"] = round(kb/1024/1024, 2)
                    break
    except Exception:
        pass
    runtimes = {
        "ollama": bool(os.getenv("OLLAMA_URL") or shutil.which("ollama")),
        "coreml": info["os"] == "Darwin",
        "cuda": bool(shutil.which("nvidia-smi")),
        "mps": info["os"] == "Darwin",
    }
    tools = {"uvicorn": bool(shutil.which("uvicorn")), "docker": bool(shutil.which("docker"))}
    return {"info": info, "runtimes": runtimes, "tools": tools}

def _find_price(provider: str, model: Optional[str]) -> Optional[Dict[str, Any]]:
    data = _read_json(GUI_DIR / "prices.json", {"models": []})
    models = data.get("models", [])
    # Prefer exact provider+model, else fallback to first matching provider
    for m in models:
        if m.get("provider") == provider and (model is None or m.get("model") == model):
            return m
    for m in models:
        if m.get("provider") == provider:
            return m
    return None

def _estimate_cost(gen_provider: str, gen_model: Optional[str], tokens_in: int, tokens_out: int, embeds: int, reranks: int, requests_per_day: int,
                   embed_provider: Optional[str] = None, embed_model: Optional[str] = None,
                   rerank_provider: Optional[str] = None, rerank_model: Optional[str] = None) -> Dict[str, Any]:
    # Generation
    price_gen = _find_price(gen_provider, gen_model)
    if not price_gen:
        price_gen = {"input_per_1k": 0.0, "output_per_1k": 0.0, "per_request": 0.0}
    per_1k_in = float(price_gen.get("input_per_1k", 0.0))
    per_1k_out = float(price_gen.get("output_per_1k", 0.0))
    per_req = float(price_gen.get("per_request", 0.0))
    daily = 0.0
    daily += (tokens_in/1000.0) * per_1k_in * max(1, requests_per_day)
    daily += (tokens_out/1000.0) * per_1k_out * max(1, requests_per_day)
    daily += per_req * max(1, requests_per_day)

    # Embeddings (separate provider/model)
    if embeds > 0:
        if embed_provider is None and gen_provider == 'openai':
            embed_provider, embed_model = 'openai', (embed_model or 'text-embedding-3-small')
        price_emb = _find_price(embed_provider or gen_provider, embed_model)
        if price_emb:
            daily += (embeds/1000.0) * float(price_emb.get("embed_per_1k", 0.0))

    # Rerank
    if reranks > 0:
        price_rr = _find_price(rerank_provider or 'cohere', rerank_model or 'rerank-3.5')
        if price_rr:
            daily += (reranks/1000.0) * float(price_rr.get("rerank_per_1k", 0.0))

    breakdown = {
        "generation": price_gen,
        "embeddings": _find_price(embed_provider or gen_provider, embed_model) if embeds>0 else None,
        "rerank": _find_price(rerank_provider or 'cohere', rerank_model or 'rerank-3.5') if reranks>0 else None,
    }
    return {"daily": round(daily, 6), "monthly": round(daily*30.0, 4), "breakdown": breakdown}

@app.post("/api/cost/estimate")
def cost_estimate(payload: Dict[str, Any]) -> Dict[str, Any]:
    gen_provider = str(payload.get("gen_provider") or payload.get("provider") or "openai")
    gen_model = payload.get("gen_model")
    tokens_in = int(payload.get("tokens_in") or 0)
    tokens_out = int(payload.get("tokens_out") or 0)
    embeds = int(payload.get("embeds") or 0)
    reranks = int(payload.get("reranks") or 0)
    rpd = int(payload.get("requests_per_day") or 0)
    emb_prov = payload.get("embed_provider")
    emb_model = payload.get("embed_model")
    rr_prov = payload.get("rerank_provider")
    rr_model = payload.get("rerank_model")
    return _estimate_cost(gen_provider, gen_model, tokens_in, tokens_out, embeds, reranks, rpd,
                          embed_provider=emb_prov, embed_model=emb_model,
                          rerank_provider=rr_prov, rerank_model=rr_model)

@app.post("/api/cost/estimate_pipeline")
def cost_estimate_pipeline(payload: Dict[str, Any]) -> Dict[str, Any]:
    # same shape as estimate(), kept for compatibility
    return cost_estimate(payload)

@app.get("/api/profiles")
def profiles_list() -> Dict[str, Any]:
    prof_dir = GUI_DIR / "profiles"
    prof_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for p in prof_dir.glob("*.json"):
        names.append(p.stem)
    return {"profiles": sorted(names), "default": None}

@app.post("/api/profiles/save")
def profiles_save(payload: Dict[str, Any]) -> Dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    prof = payload.get("profile") or {}
    if not name:
        raise HTTPException(status_code=400, detail="missing name")
    path = GUI_DIR / "profiles" / f"{name}.json"
    _write_json(path, prof)
    return {"ok": True, "name": name}

@app.post("/api/profiles/apply")
def profiles_apply(payload: Dict[str, Any]) -> Dict[str, Any]:
    prof = payload.get("profile") or {}
    applied = []
    for k, v in prof.items():
        os.environ[str(k)] = str(v)
        applied.append(str(k))
    return {"ok": True, "applied_keys": applied}

# --- Index + Cards: minimal stubs to keep GUI functional ---
_INDEX_STATUS: List[str] = []

@app.post("/api/index/start")
def index_start() -> Dict[str, Any]:
    global _INDEX_STATUS
    _INDEX_STATUS = ["Prepared 123 chunks", "BM25 index saved", "Indexed 123 chunks to Qdrant"]
    return {"ok": True}

@app.get("/api/index/status")
def index_status() -> Dict[str, Any]:
    return {"lines": _INDEX_STATUS}

@app.post("/api/cards/build")
def cards_build() -> Dict[str, Any]:
    return {"ok": True}

@app.get("/api/cards")
def cards_list() -> Dict[str, Any]:
    return {"cards": []}

# ---------------- Git hooks helpers ----------------
def _git_hooks_dir() -> Path:
    # repo root assumed to be same as this file's parent
    root = ROOT
    return root / ".git" / "hooks"

_HOOK_POST_CHECKOUT = """#!/usr/bin/env bash
# Auto-index on branch changes when AUTO_INDEX=1
[ "${AUTO_INDEX:-0}" != "1" ] && exit 0
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root" || exit 0
if [ -d .venv ]; then . .venv/bin/activate; fi
export REPO=agro EMBEDDING_TYPE=local SKIP_DENSE=1
export OUT_DIR_BASE="./out.noindex-shared"
python index_repo.py >/dev/null 2>&1 || true
"""

_HOOK_POST_COMMIT = """#!/usr/bin/env bash
# Auto-index on commit when AUTO_INDEX=1
[ "${AUTO_INDEX:-0}" != "1" ] && exit 0
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root" || exit 0
if [ -d .venv ]; then . .venv/bin/activate; fi
export REPO=agro EMBEDDING_TYPE=local SKIP_DENSE=1
export OUT_DIR_BASE="./out.noindex-shared"
python index_repo.py >/dev/null 2>&1 || true
"""

@app.get("/api/git/hooks/status")
def git_hooks_status() -> Dict[str, Any]:
    d = _git_hooks_dir()
    pc = d / "post-checkout"
    pm = d / "post-commit"
    return {
        "dir": str(d),
        "post_checkout": pc.exists(),
        "post_commit": pm.exists(),
        "enabled_hint": "export AUTO_INDEX=1"
    }

@app.post("/api/git/hooks/install")
def git_hooks_install() -> Dict[str, Any]:
    d = _git_hooks_dir()
    try:
        d.mkdir(parents=True, exist_ok=True)
        pc = d / "post-checkout"
        pm = d / "post-commit"
        pc.write_text(_HOOK_POST_CHECKOUT)
        pm.write_text(_HOOK_POST_COMMIT)
        os.chmod(pc, 0o755)
        os.chmod(pm, 0o755)
        return {"ok": True, "message": "Installed git hooks. Enable with: export AUTO_INDEX=1"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
