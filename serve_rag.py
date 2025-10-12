from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from langgraph_app import build_graph
from hybrid_search import search_routed_multi
from config_loader import load_repos
from server.index_stats import get_index_stats as _get_index_stats
from path_config import repo_root, gui_dir, docs_dir, files_root
import os, json, sys
from typing import Any, Dict
from collections import Counter, defaultdict

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

ROOT = repo_root()
GUI_DIR = gui_dir()
DOCS_DIR = docs_dir()

# Serve static GUI assets
if GUI_DIR.exists():
    app.mount("/gui", StaticFiles(directory=str(GUI_DIR), html=True), name="gui")

# Serve local docs and repo files for in-GUI links
if DOCS_DIR.exists():
    app.mount("/docs", StaticFiles(directory=str(DOCS_DIR), html=True), name="docs")
app.mount("/files", StaticFiles(directory=str(files_root()), html=True), name="files")

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
    repo: Optional[str] = Query(None, description="Repository override: agro|agro")
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
    repo: Optional[str] = Query(None, description="Repository override: agro|agro"),
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

# ---- Prices helper for auto-profile
def _default_prices() -> Dict[str, Any]:
    return {
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

def _read_prices() -> Dict[str, Any]:
    data = _read_json(GUI_DIR / "prices.json", {"models": []})
    if not data or not isinstance(data, dict) or not data.get("models"):
        return _default_prices()
    return data

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

@app.post("/api/config")
def set_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Persist environment variables and repos.json edits coming from the GUI.

    Shape: { env: {KEY: VALUE, ...}, repos: [{name, path, keywords, path_boosts, layer_bonuses}, ...] }

    - Writes env keys to .env in repo root (idempotent upsert)
    - Writes repos to repos.json
    - Also applies env to current process so the running server reflects changes immediately
    """
    root = ROOT
    env_updates: Dict[str, Any] = dict(payload.get("env") or {})
    repos_updates: List[Dict[str, Any]] = list(payload.get("repos") or [])

    # 1) Upsert .env
    env_path = root / ".env"
    existing: Dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if not line.strip() or line.strip().startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            existing[k.strip()] = v.strip()
    for k, v in env_updates.items():
        existing[str(k)] = str(v)
        os.environ[str(k)] = str(v)
    # Write back
    lines = [f"{k}={existing[k]}" for k in sorted(existing.keys())]
    env_path.write_text("\n".join(lines) + "\n")

    # 2) Upsert repos.json
    repos_path = root / "repos.json"
    cfg = _read_json(repos_path, {"default_repo": None, "repos": []})
    # Keep default_repo if provided in env
    default_repo = env_updates.get("REPO") or cfg.get("default_repo")
    # Merge repos by name
    by_name: Dict[str, Dict[str, Any]] = {str(r.get("name")): r for r in cfg.get("repos", []) if r.get("name")}
    for r in repos_updates:
        name = str(r.get("name") or "").strip()
        if not name:
            continue
        cur = by_name.get(name, {"name": name})
        # Only accept expected keys
        if "path" in r:
            cur["path"] = r["path"]
        if "keywords" in r and isinstance(r["keywords"], list):
            cur["keywords"] = [str(x) for x in r["keywords"]]
        if "path_boosts" in r and isinstance(r["path_boosts"], list):
            cur["path_boosts"] = [str(x) for x in r["path_boosts"]]
        if "layer_bonuses" in r and isinstance(r["layer_bonuses"], dict):
            cur["layer_bonuses"] = r["layer_bonuses"]
        by_name[name] = cur
    new_cfg = {
        "default_repo": default_repo,
        "repos": sorted(by_name.values(), key=lambda x: str(x.get("name")))
    }
    _write_json(repos_path, new_cfg)

    return {"status": "success", "applied_env_keys": sorted(existing.keys()), "repos_count": len(new_cfg["repos"]) }

@app.get("/api/prices")
def get_prices():
    prices_path = GUI_DIR / "prices.json"
    data = _read_json(prices_path, _default_prices())
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
                # prefer "agro" or "agro" buckets, else flatten all lists
                for bucket in ("agro", "agro"):
                    if bucket in obj and isinstance(obj[bucket], list):
                        out.extend(extract_terms(obj[bucket]))
                        return out
                for v in obj.values():
                    out.extend(extract_terms(v))
        except Exception:
            pass
        return out
    discr_raw = _read_json(repo_root() / "discriminative_keywords.json", {})
    sema_raw = _read_json(repo_root() / "semantic_keywords.json", {})
    llm_raw = _read_json(repo_root() / "llm_keywords.json", {})
    discr = extract_terms(discr_raw)
    sema = extract_terms(sema_raw)
    llm = extract_terms(llm_raw)
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
    llm = uniq(llm)
    repo_k = uniq(repo_k)
    allk = uniq((discr or []) + (sema or []) + (llm or []) + (repo_k or []))
    return {"discriminative": discr, "semantic": sema, "llm": llm, "repos": repo_k, "keywords": allk}

@app.post("/api/keywords/generate")
def generate_keywords(body: Dict[str, Any]) -> Dict[str, Any]:
    """Generate keywords using either heuristics or an LLM (GUI‑selectable).

    Body: { repo: str, mode?: 'heuristic' | 'llm', max_files?: int }
    - heuristic: runs scripts/analyze_keywords.py and scripts/analyze_keywords_v2.py
    - llm: samples files and uses metadata_enricher.enrich to accumulate keywords
    """
    import subprocess
    import time
    from config_loader import get_repo_paths

    repo = body.get("repo")
    mode = (body.get("mode") or os.getenv("KEYWORDS_GEN_MODE", "heuristic")).strip().lower()
    max_files = int(body.get("max_files") or os.getenv("KEYWORDS_MAX_FILES", "60") or 60)
    if not repo:
        return {"error": "repo parameter required", "ok": False}

    results: Dict[str, Any] = {
        "ok": True,
        "repo": repo,
        "mode": mode,
        "discriminative": {"count": 0, "file": "discriminative_keywords.json"},
        "semantic": {"count": 0, "file": "semantic_keywords.json"},
        "llm": {"count": 0, "file": "llm_keywords.json"},
        "total_count": 0,
        "duration_seconds": 0,
    }

    start_time = time.time()

    # Heuristic pipeline (existing behavior)
    def run_heuristic() -> None:
        """Inline heuristic generation (no external scripts).

        More permissive than before: computes TF–IDF over all tokens with a
        small stopword list and falls back to top-frequency tokens when needed.
        """
        nonlocal results
        import re
        try:
            bases = get_repo_paths(repo)
        except Exception as e:
            results["ok"] = False
            results["error"] = str(e)
            return

        # Gather candidate files
        exts = {".py", ".rb", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".cs", ".yml", ".yaml", ".md"}
        files: List[Path] = []
        for base in bases:
            p = Path(base).expanduser()
            if not p.exists():
                continue
            for root, dirs, fnames in os.walk(p):
                dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}]
                for fn in fnames:
                    if Path(fn).suffix.lower() in exts:
                        files.append(Path(root) / fn)
        if not files:
            results["ok"] = False
            results["error"] = f"No source files found for repo {repo}"
            return

        # Tokenization helpers
        str_rx = re.compile(r'["\'].*?["\']', re.S)
        hash_comment = re.compile(r'#.*?\n')
        sl_comment = re.compile(r'//.*?\n')
        ident_rx = re.compile(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b')
        stop = set([
            'the','and','that','with','this','from','into','your','you','for','are','was','have','has','will','can','not','out','one','two',
            'def','class','import','return','const','let','var','function','void','null','true','false','elif','else','try','except','finally',
            'self','args','kwargs','none','object','module','package','public','private','static','final','new','extends','implements','using',
            'todo','fixme','note','copyright','license','utf','ascii','error','warn','info','data','item','value','result','type','types'
        ])

        def extract_tokens(text: str) -> List[str]:
            text = str_rx.sub('', text)
            text = hash_comment.sub('\n', text)
            text = sl_comment.sub('\n', text)
            toks = ident_rx.findall(text)
            return [t.lower() for t in toks if len(t) > 2]

        # Discriminative (TF–IDF)
        file_tokens: Dict[str, set[str]] = {}
        global_counts: Counter[str] = Counter()
        for fp in files:
            try:
                code = fp.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue
            toks = set(t for t in extract_tokens(code) if t not in stop)
            file_tokens[str(fp)] = toks
            for t in toks:
                global_counts[t] += 1
        num_files = max(1, len(file_tokens))
        doc_freq: Counter[str] = Counter()
        for toks in file_tokens.values():
            doc_freq.update(toks)
        import math as _m
        keyword_scores: Dict[str, float] = {}
        for token, df in doc_freq.items():
            if df <= 1:
                continue
            idf = _m.log(num_files / (1.0 + df)) if num_files > 1 else 0.0
            tf = global_counts[token]
            score = tf * (idf if idf > 0 else 1.0)
            keyword_scores[token] = float(score)
        topn_discr = int(os.getenv("KEYWORDS_TOPN_DISCR", "60") or 60)
        discr_sorted = sorted(keyword_scores.items(), key=lambda x: x[1], reverse=True)[:topn_discr]
        discr_list = [k for k, _ in discr_sorted]
        if not discr_list:
            # fallback: top tokens by document frequency
            discr_list = [k for k, _ in doc_freq.most_common(topn_discr) if k not in stop]
        # Persist
        discr_path = repo_root() / "discriminative_keywords.json"
        discr_data = _read_json(discr_path, {})
        if not isinstance(discr_data, dict):
            discr_data = {}
        discr_data[str(repo)] = discr_list
        _write_json(discr_path, discr_data)
        results["discriminative"]["count"] = len(discr_list)

        # Semantic (domain-ish): frequency across files with directory boost
        dir_terms: set[str] = set()
        for fp in files:
            for part in Path(fp).parts:
                s = re.sub(r'[^a-zA-Z0-9_]+', ' ', part)
                for w in s.split():
                    if len(w) > 2:
                        dir_terms.add(w.lower())
        term_files: Dict[str, set[str]] = defaultdict(set)
        term_counts: Counter[str] = Counter()
        for fp in files:
            try:
                code = Path(fp).read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue
            terms = [t for t in extract_tokens(code) if t not in stop]
            rel = str(fp)
            for t in terms:
                term_counts[t] += 1
                term_files[t].add(rel)
        scored: list[tuple[str, float]] = []
        for t, fileset in term_files.items():
            fc = len(fileset)
            if fc >= 2 and fc <= max(3, int(0.5 * num_files)):
                dir_boost = 2.0 if t in dir_terms else 1.0
                score = (term_counts[t] * fc * dir_boost) / (num_files + 1)
                scored.append((t, score))
        topn_sem = int(os.getenv("KEYWORDS_TOPN_SEM", "60") or 60)
        sem_sorted = sorted(scored, key=lambda x: x[1], reverse=True)[:topn_sem]
        sem_list = [k for k, _ in sem_sorted]
        if not sem_list:
            sem_list = [k for k, _ in term_counts.most_common(topn_sem) if k not in stop]
        sem_path = repo_root() / "semantic_keywords.json"
        sem_data = _read_json(sem_path, {})
        if not isinstance(sem_data, dict):
            sem_data = {}
        sem_data[str(repo)] = sem_list
        _write_json(sem_path, sem_data)
        results["semantic"]["count"] = len(sem_list)

        # Emergency fallback: still zero? derive from file and directory names
        if (results["discriminative"]["count"] or 0) == 0 and (results["semantic"]["count"] or 0) == 0:
            base_terms: Counter[str] = Counter()
            for fp in files:
                parts = Path(fp).parts
                for part in parts:
                    part = re.sub(r'[^a-zA-Z0-9_]+', ' ', part)
                    for w in part.split():
                        w = w.lower()
                        if len(w) > 2 and w not in stop:
                            base_terms[w] += 1
            emer = [k for k, _ in base_terms.most_common(40)]
            if emer:
                discr_data[str(repo)] = emer[:20]
                sem_data[str(repo)] = emer[:20]
                _write_json(discr_path, discr_data)
                _write_json(sem_path, sem_data)
                results["discriminative"]["count"] = len(discr_data[str(repo)])
                results["semantic"]["count"] = len(sem_data[str(repo)])

    # LLM pipeline (new)
    def run_llm(backend_override: str | None = None, model_override: str | None = None) -> None:
        nonlocal results
        try:
            from metadata_enricher import enrich  # uses MLX or Ollama based on env
        except Exception as e:  # pragma: no cover
            results["ok"] = False
            results["error"] = f"LLM backend unavailable: {e}"
            return

        # Collect candidate files (reuse indexer filters loosely)
        exts = {".py", ".rb", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".cs", ".yml", ".yaml", ".md"}
        files: List[Path] = []
        try:
            bases = get_repo_paths(repo)
        except Exception as e:
            results["ok"] = False
            results["error"] = str(e)
            return
        for base in bases:
            p = Path(base).expanduser()
            if not p.exists():
                continue
            for root, dirs, fnames in os.walk(p):
                # prune noisy dirs
                dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}]
                for fn in fnames:
                    if Path(fn).suffix.lower() in exts:
                        files.append(Path(root) / fn)
        # Sample limited number deterministically: smallest paths first for stability
        files = sorted(files, key=lambda pp: (len(str(pp)), str(pp)))[:max_files]

        counts: Counter[str] = Counter()
        per_file_limit = int(os.getenv("KEYWORDS_PER_FILE", "10") or 10)
        # Temporarily override enrich backend/model if provided
        old_env = {"ENRICH_BACKEND": os.environ.get("ENRICH_BACKEND"), "ENRICH_MODEL_OPENAI": os.environ.get("ENRICH_MODEL_OPENAI"), "GEN_MODEL": os.environ.get("GEN_MODEL")}
        if backend_override:
            os.environ["ENRICH_BACKEND"] = backend_override
        if model_override:
            # prefer specific openai enrich model, else set GEN_MODEL used by openai client
            os.environ["ENRICH_MODEL_OPENAI"] = model_override
            os.environ["GEN_MODEL"] = model_override
        try:
            for fp in files:
                try:
                    text = fp.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue
                # clip to manageable size
                text = text[:8000]
                meta = enrich(str(fp), Path(fp).suffix.lstrip('.'), text) or {}
                kws = [str(k).strip().lower() for k in (meta.get("keywords") or []) if isinstance(k, str)]
                for k in kws[:per_file_limit]:
                    if k:
                        counts[k] += 1
        finally:
            # restore environment
            for k, v in old_env.items():
                if v is None:
                    if k in os.environ:
                        del os.environ[k]
                else:
                    os.environ[k] = v
        # Persist results
        top_total = int(os.getenv("KEYWORDS_MAX_TOTAL", "200") or 200)
        ranked = [k for k, _ in counts.most_common(top_total)]
        out_path = repo_root() / "llm_keywords.json"
        data = _read_json(out_path, {})
        if not isinstance(data, dict):
            data = {}
        data[str(repo)] = ranked
        _write_json(out_path, data)
        results["llm"]["count"] = len(ranked)

    try:
        if mode == "llm":
            backend = (body.get("backend") or os.getenv("ENRICH_BACKEND") or "openai").strip().lower()
            model_override = None
            if backend == "openai":
                model_override = body.get("openai_model") or os.getenv("ENRICH_MODEL_OPENAI") or os.getenv("GEN_MODEL")
            run_llm(backend_override=backend, model_override=model_override)
            # If LLM produced nothing, fall back to heuristics for useful output
            if (results.get("llm", {}).get("count") or 0) == 0:
                run_heuristic()
        else:
            run_heuristic()
        # Compose totals (heuristic writes discr/semantic; llm writes llm)
        results["total_count"] = (
            (results.get("discriminative", {}).get("count") or 0)
            + (results.get("semantic", {}).get("count") or 0)
            + (results.get("llm", {}).get("count") or 0)
        )
        results["duration_seconds"] = round(time.time() - start_time, 2)
    except subprocess.TimeoutExpired:
        results["ok"] = False
        results["error"] = "Keyword generation timed out (300s limit)"
    except Exception as e:
        results["ok"] = False
        results["error"] = str(e)

    return results

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

# --- Auto-profile v2
try:
    from autoprofile import autoprofile as _ap_select
except Exception:
    _ap_select = None

@app.post("/api/profile/autoselect")
def api_profile_autoselect(payload: Dict[str, Any]):
    if _ap_select is None:
        raise HTTPException(status_code=500, detail="autoprofile module not available")
    prices = _read_prices()
    env, reason = _ap_select(payload, prices)
    if not env:
        raise HTTPException(status_code=422, detail=reason)
    return {"env": env, "reason": reason}

@app.post("/api/checkpoint/config")
def checkpoint_config() -> Dict[str, Any]:
    """Write a timestamped checkpoint of current env + repos to gui/profiles."""
    cfg = get_config()
    from datetime import datetime
    ts = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    out_dir = GUI_DIR / "profiles"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"checkpoint-{ts}.json"
    _write_json(path, cfg)
    return {"ok": True, "path": str(path)}

# --- Index + Cards: comprehensive status with all metrics ---
_INDEX_STATUS: List[str] = []
_INDEX_METADATA: Dict[str, Any] = {}

@app.post("/api/index/start")
def index_start() -> Dict[str, Any]:
    """Start indexing with real subprocess execution."""
    global _INDEX_STATUS, _INDEX_METADATA
    import subprocess
    import threading

    _INDEX_STATUS = ["Indexing started..."]
    _INDEX_METADATA = {}

    def run_index():
        global _INDEX_STATUS, _INDEX_METADATA
        try:
            repo = os.getenv("REPO", "agro")
            _INDEX_STATUS.append(f"Indexing repository: {repo}")

            # Run the actual indexer
            result = subprocess.run(
                ["python", "index_repo.py"],
                capture_output=True,
                text=True,
                cwd=repo_root(),
                env={**os.environ, "REPO": repo}
            )

            if result.returncode == 0:
                _INDEX_STATUS.append("✓ Indexing completed successfully")
                _INDEX_METADATA = _get_index_stats()
            else:
                _INDEX_STATUS.append(f"✗ Indexing failed: {result.stderr[:200]}")
        except Exception as e:
            _INDEX_STATUS.append(f"✗ Error: {str(e)}")

    # Run in background
    thread = threading.Thread(target=run_index, daemon=True)
    thread.start()

    return {"ok": True, "message": "Indexing started in background"}

@app.get("/api/index/status")
def index_status() -> Dict[str, Any]:
    """Return comprehensive indexing status with all metrics."""
    if not _INDEX_METADATA:
        # Return basic status if no metadata yet
        return {
            "lines": _INDEX_STATUS,
            "running": len(_INDEX_STATUS) > 0 and not any("completed" in s or "failed" in s for s in _INDEX_STATUS),
            "metadata": _get_index_stats()  # Always provide current stats
        }

    return {
        "lines": _INDEX_STATUS,
        "running": False,
        "metadata": _INDEX_METADATA
    }

@app.post("/api/cards/build")
def cards_build() -> Dict[str, Any]:
    return {"ok": True}

@app.get("/api/cards")
def cards_list() -> Dict[str, Any]:
    return {"cards": []}

# ---------------- Git hooks helpers ----------------
def _git_hooks_dir() -> Path:
    root = repo_root()
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
