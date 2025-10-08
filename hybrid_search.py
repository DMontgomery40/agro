import os
import json
import collections
from typing import List, Dict
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from qdrant_client import QdrantClient, models
import bm25s
from bm25s.tokenization import Tokenizer
from Stemmer import Stemmer
from rerank import rerank as ce_rerank
from sentence_transformers import SentenceTransformer

# Query intent → layer preferences
def _classify_query(q:str)->str:
    ql=(q or '').lower()
    if any(k in ql for k in ['ui','react','component','tsx','page','frontend','render','css']):
        return 'ui'
    if any(k in ql for k in ['notification','pushover','apprise','hubspot','provider','integration','adapter','webhook']):
        return 'integration'
    if any(k in ql for k in ['diagnostic','health','event log','phi','mask','hipaa','middleware','auth','token','oauth','hmac']):
        return 'server'
    if any(k in ql for k in ['sdk','client library','python sdk','node sdk']):
        return 'sdk'
    if any(k in ql for k in ['infra','asterisk','sip','t.38','ami','freeswitch','egress','cloudflared']):
        return 'infra'
    return 'server'

def _vivified_layer_bonus(layer:str,intent:str)->float:
    layer_lower=(layer or '').lower()
    intent_lower=(intent or 'server').lower()
    table={'server':{'kernel':0.10,'plugin':0.04,'ui':0.00,'docs':0.00,'tests':0.00,'infra':0.02},
           'integration':{'integration':0.12,'kernel':0.04,'ui':0.00,'docs':0.00,'tests':0.00,'infra':0.00},
           'ui':{'ui':0.12,'docs':0.06,'kernel':0.02,'plugin':0.02,'tests':0.00,'infra':0.00},
           'sdk':{'kernel':0.04,'docs':0.02},
           'infra':{'infra':0.12,'kernel':0.04}}
    return table.get(intent_lower,{}).get(layer_lower,0.0)

def _faxbot_layer_bonus(layer:str,intent:str)->float:
    layer_lower=(layer or '').lower()
    intent_lower=(intent or 'server').lower()
    table={'server':{'server':0.10,'integration':0.06,'fax':0.30,'admin console':0.10,'sdk':0.00,'infra':0.00,'docs':0.02},
           'integration':{'provider':0.12,'traits':0.10,'server':0.06,'ui':0.00,'sdk':0.00,'infra':0.02,'docs':0.00},
           'ui':{'ui':0.12,'docs':0.06,'server':0.02,'hipaa':0.20},
           'sdk':{'sdk':0.12,'server':0.04,'docs':0.02},
           'infra':{'infra':0.12,'server':0.04,'provider':0.04}}
    return table.get(intent_lower,{}).get(layer_lower,0.0)

def _provider_plugin_hint(fp:str, code:str)->float:
    fp=(fp or '').lower()
    code=(code or '').lower()
    keys=['provider','providers','integration','adapter','webhook','pushover','apprise','hubspot']
    return 0.06 if any(k in fp or k in code for k in keys) else 0.0

def _origin_bonus(origin:str, mode:str)->float:
    origin = (origin or '').lower()
    mode=(mode or 'prefer_first_party').lower()
    if mode == 'prefer_first_party':
        return 0.06 if origin=='first_party' else (-0.08 if origin=='vendor' else 0.0)
    if mode == 'prefer_vendor':
        return 0.06 if origin=='vendor' else 0.0
    return 0.0

def _feature_bonus(query:str, fp:str, code:str)->float:
    ql = (query or '').lower()
    fp = (fp or '').lower()
    code=(code or '').lower()
    bumps = 0.0
    if any(k in ql for k in ['diagnostic','health','event log','phi','hipaa']):
        if ('diagnostic' in fp) or ('diagnostic' in code) or ('event' in fp and 'log' in fp):
            bumps += 0.06
    return bumps

def _card_bonus(chunk_id: str, card_chunk_ids: set) -> float:
    """Boost chunks that matched via card-based retrieval."""
    return 0.08 if str(chunk_id) in card_chunk_ids else 0.0

# Path-aware bonus to tilt results toward likely server/auth code
def _path_bonus(fp: str) -> float:
    fp = (fp or '').lower()
    bonus = 0.0
    for sfx, b in [
        ('/identity/', 0.12),
        ('/auth/', 0.12),
        ('/server', 0.10),
        ('/backend', 0.10),
        ('/api/', 0.08),
    ]:
        if sfx in fp:
            bonus += b
    return bonus

# Additional Faxbot-only path boosts (env-tunable)
def _faxbot_path_boost(fp: str, repo_tag: str) -> float:
    import os as _os
    if (repo_tag or '').lower() != 'faxbot':
        return 0.0
    cfg = _os.getenv('FAXBOT_PATH_BOOSTS', 'app/,lib/,config/,scripts/,server/,api/,api/app,app/services,app/routers,api/admin_ui,app/plugins')
    tokens = [t.strip().lower() for t in cfg.split(',') if t.strip()]
    s = (fp or '').lower()
    bonus = 0.0
    for tok in tokens:
        if tok and tok in s:
            bonus += 0.06
    return min(bonus, 0.18)

# Load environment from repo root .env without hard-coded paths
try:
    load_dotenv(override=False)
    repo_root = Path(__file__).resolve().parent
    env_path = repo_root / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    else:
        alt = find_dotenv(usecwd=True)
        if alt:
            load_dotenv(dotenv_path=alt, override=False)
except Exception:
    pass
QDRANT_URL = os.getenv('QDRANT_URL','http://127.0.0.1:6333')
REPO = os.getenv('REPO','vivified')
VENDOR_MODE = os.getenv('VENDOR_MODE','prefer_first_party')
COLLECTION = f'code_chunks_{REPO}'
def rrf(
    dense: list,
    sparse: list,
    k: int = 10,
    kdiv: int = 60
) -> list:
    """
    Reciprocal Rank Fusion (RRF) for combining dense and sparse retrieval results.

    Args:
        dense (List): Ranked list of IDs from dense retrieval.
        sparse (List): Ranked list of IDs from sparse retrieval.
        k (int, optional): Number of top results to return. Defaults to 10.
        kdiv (int, optional): RRF constant to dampen rank impact. Defaults to 60.

    Returns:
        List: Top-k fused IDs by RRF score.
    """
    score: dict = collections.defaultdict(float)
    for rank, pid in enumerate(dense, start=1):
        score[pid] += 1.0 / (kdiv + rank)
    for rank, pid in enumerate(sparse, start=1):
        score[pid] += 1.0 / (kdiv + rank)
    ranked = sorted(score.items(), key=lambda x: x[1], reverse=True)
    return [pid for pid, _ in ranked[:k]]
def _load_chunks() -> List[Dict]:
    p = os.path.join(os.path.dirname(__file__), 'out', REPO, 'chunks.jsonl')
    chunks = []
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            for line in f:
                chunks.append(json.loads(line))
    return chunks

def _load_bm25_map(idx_dir: str):
    # Prefer point IDs (UUID strings) aligned with Qdrant
    pid_json = os.path.join(idx_dir, 'bm25_point_ids.json')
    if os.path.exists(pid_json):
        m = json.load(open(pid_json))
        return [m[str(i)] for i in range(len(m))]
    # Fallback to chunk_ids.txt (string chunk IDs)
    map_path = os.path.join(idx_dir, 'chunk_ids.txt')
    if os.path.exists(map_path):
        with open(map_path, 'r', encoding='utf-8') as f:
            ids = [line.strip() for line in f if line.strip()]
        return ids
    return None

def _load_cards_bm25(repo: str):
    idx_dir = os.path.join(os.path.dirname(__file__), 'out', repo, 'bm25_cards')
    try:
        import bm25s
        retr = bm25s.BM25.load(idx_dir)
        return retr
    except Exception:
        return None

def _load_cards_map(repo: str) -> Dict:
    """Load cards to get chunk ID mapping. Returns dict with card index -> chunk_id and chunk_id -> card data."""
    cards_file = os.path.join(os.path.dirname(__file__), 'out', repo, 'cards.jsonl')
    cards_by_idx = {}  # card corpus index -> chunk_id
    cards_by_chunk_id = {}  # chunk_id -> card metadata
    try:
        with open(cards_file, 'r', encoding='utf-8') as f:
            for idx, line in enumerate(f):
                card = json.loads(line)
                chunk_id = str(card.get('id', ''))
                if chunk_id:
                    cards_by_idx[idx] = chunk_id
                    cards_by_chunk_id[chunk_id] = card
        return {'by_idx': cards_by_idx, 'by_chunk_id': cards_by_chunk_id}
    except Exception:
        return {'by_idx': {}, 'by_chunk_id': {}}

def search(query: str, topk_dense: int = 75, topk_sparse: int = 75, final_k: int = 10) -> List[Dict]:
    chunks = _load_chunks()
    if not chunks:
        return []

    # ---- Dense (Qdrant) ----
    dense_pairs = []
    qc = QdrantClient(url=QDRANT_URL)
    coll = f'code_chunks_{REPO}'
    e = None
    if os.getenv('OPENAI_API_KEY'):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            e = client.embeddings.create(model='text-embedding-3-large', input=[query]).data[0].embedding
        except Exception:
            e = None
    if e is None:
        # fall back to local embedding to match index
        model = SentenceTransformer('BAAI/bge-small-en-v1.5')
        e = model.encode([query], normalize_embeddings=True, show_progress_bar=False)[0].tolist()
    try:
        dres = qc.query_points(
            collection_name=coll,
            query=e,
            using='dense',
            limit=topk_dense,
            with_payload=models.PayloadSelectorInclude(include=['file_path','start_line','end_line','language','layer','repo','hash','id'])
        )
        points = getattr(dres, 'points', dres)
        dense_pairs = [(str(p.id), dict(p.payload)) for p in points]  # type: ignore
    except Exception:
        dense_pairs = []

    # ---- Sparse (BM25S) ----
    idx_dir = os.path.join(os.path.dirname(__file__), 'out', REPO, 'bm25_index')
    retriever = bm25s.BM25.load(idx_dir)
    tokenizer = Tokenizer(stemmer=Stemmer('english'), stopwords='en')
    tokens = tokenizer.tokenize([query])
    ids, _ = retriever.retrieve(tokens, k=topk_sparse)
    # ids shaped (1, k)
    ids = ids.tolist()[0] if hasattr(ids, 'tolist') else list(ids[0])
    id_map = _load_bm25_map(idx_dir)
    by_chunk_id = {str(c['id']): c for c in chunks}
    sparse_pairs = []
    for i in ids:
        if id_map is not None:
            if 0 <= i < len(id_map):
                pid_or_cid = id_map[i]
                key = str(pid_or_cid)
                if key in by_chunk_id:
                    # id_map contained chunk id
                    sparse_pairs.append((key, by_chunk_id[key]))
                else:
                    # Fallback to corpus order alignment
                    if 0 <= i < len(chunks):
                        sparse_pairs.append((str(chunks[i]['id']), chunks[i]))
        else:
            # fallback to corpus order alignment
            if 0 <= i < len(chunks):
                sparse_pairs.append((str(chunks[i]['id']), chunks[i]))

    # Card-based BM25 boosting: retrieve cards and boost matching chunks
    card_chunk_ids: set = set()
    cards_retr = _load_cards_bm25(REPO)
    if cards_retr is not None:
        try:
            cards_map = _load_cards_map(REPO)
            tokens = bm25s.tokenize(query, stopwords='en')
            c_ids, _ = cards_retr.retrieve(tokens, k=min(topk_sparse, 30))
            # Map card indices to chunk IDs
            c_ids_flat = c_ids[0] if hasattr(c_ids, '__getitem__') else c_ids
            for card_idx in c_ids_flat:
                chunk_id = cards_map['by_idx'].get(int(card_idx))
                if chunk_id:
                    card_chunk_ids.add(str(chunk_id))
        except Exception:
            pass

    # Fuse
    dense_ids = [pid for pid,_ in dense_pairs]
    sparse_ids = [pid for pid,_ in sparse_pairs]
    fused = rrf(dense_ids, sparse_ids, k=max(final_k, 2*final_k)) if dense_pairs else sparse_ids[:final_k]
    by_id = {pid: p for pid,p in (dense_pairs + sparse_pairs)}
    docs = [by_id[pid] for pid in fused if pid in by_id]
    # Hydrate code bodies from local cache before CE rerank
    cache = _load_code_cache(REPO)
    for d in docs:
        if not d.get('code'):
            h = d.get('hash')
            cid = str(d.get('id',''))
            d['code'] = cache['by_hash'].get(h) or cache['by_id'].get(cid) or ''
    docs = ce_rerank(query, docs, top_k=final_k)
    # Apply path + layer intent + provider + feature + card + (optional) origin bonuses, then resort
    intent = _classify_query(query)
    for d in docs:
        layer_bonus = _vivified_layer_bonus(d.get('layer',''), intent) if REPO=='vivified' else _faxbot_layer_bonus(d.get('layer',''), intent)
        origin_bonus = _origin_bonus(d.get('origin',''), VENDOR_MODE) if 'VENDOR_MODE' in os.environ else 0.0
        repo_tag = d.get('repo', REPO)
        chunk_id = str(d.get('id', ''))
        d['rerank_score'] = float(
            d.get('rerank_score', 0.0)
            + _path_bonus(d.get('file_path', ''))
            + _faxbot_path_boost(d.get('file_path',''), repo_tag)
            + layer_bonus
            + _provider_plugin_hint(d.get('file_path', ''), d.get('code', '')[:1000])
            + _feature_bonus(query, d.get('file_path',''), d.get('code','')[:800])
            + _card_bonus(chunk_id, card_chunk_ids)
            + origin_bonus
        )
    docs.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return docs[:final_k]

# Local code cache to hydrate code bodies from chunks.jsonl instead of Qdrant payloads
_code_cache_by_repo: dict[str, dict] = {}
def _load_code_cache(repo: str):
    import json
    if repo in _code_cache_by_repo:
        return _code_cache_by_repo[repo]
    jl = os.path.join(os.path.dirname(__file__), 'out', repo, 'chunks.jsonl')
    cache: dict[str, dict[str, str]] = {'by_hash': {}, 'by_id': {}}
    try:
        with open(jl, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                h = o.get('hash')
                cid = str(o.get('id', ''))
                code = o.get('code', '')
                if h:
                    cache['by_hash'][h] = code
                if cid:
                    cache['by_id'][cid] = code
    except FileNotFoundError:
        pass
    _code_cache_by_repo[repo] = cache
    return cache

# --- Strict per-repo routing helpers (no fusion) ---
def route_repo(query: str, default_repo: str | None = None) -> str:
    q = (query or '').lower()
    if q.startswith('vivified:') or ' vivified' in f' {q}':
        return 'vivified'
    if q.startswith('faxbot:') or ' faxbot' in f' {q}':
        return 'faxbot'
    viv_hits = 0
    for k in ['provider setup wizard','providersetupwizard','pluginsetupwizard','admin_ui','plugin','plugins','kernel','apprise','pushover','hubspot','vivified']:
        if k in q:
            viv_hits += 1
    fax_hits = 0
    for k in ['faxbot','sendfax','getfax','asterisk','ami','t.38','cloudflared','hipaa','phi','event log','diagnostic','signalwire','phaxio','documo','sinch']:
        if k in q:
            fax_hits += 1
    if viv_hits > fax_hits:
        return 'vivified'
    if fax_hits > viv_hits:
        return 'faxbot'
    return (default_repo or os.getenv('REPO', 'vivified') or 'vivified').strip()

def search_routed(query: str, repo_override: str | None = None, final_k: int = 10):
    global REPO
    prev = REPO
    REPO = (repo_override or route_repo(query, default_repo=prev) or prev).strip()
    try:
        return search(query, final_k=final_k)
    finally:
        REPO = prev

# Multi-query expansion (cheap) and routed search
def expand_queries(query: str, m: int = 4) -> list[str]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        prompt = (
            'Rewrite the developer query into {} different phrasings that help code search. '
            'Keep semantics identical. Output one per line.\nQuery: {}'
        ).format(m, query)
        r = client.chat.completions.create(model='gpt-4o-mini', messages=[{'role':'user','content':prompt}], temperature=0.3)
        content = r.choices[0].message.content or ""
        lines = [ln.strip('- ').strip() for ln in content.splitlines() if ln.strip()]
        uniq = []
        for ln in lines:
            if ln and ln not in uniq:
                uniq.append(ln)
        return (uniq or [query])[:m]
    except Exception:
        return [query]

def search_routed_multi(query: str, repo_override: str | None = None, m: int = 4, final_k: int = 10):
    repo = (repo_override or route_repo(query) or os.getenv('REPO','vivified')).strip()
    variants = expand_queries(query, m=m)
    all_docs = []
    prev = globals().get('REPO')
    globals()['REPO'] = repo
    try:
        for qv in variants:
            docs = search(qv, final_k=final_k)
            all_docs.extend(docs)
    finally:
        globals()['REPO'] = prev
    # Deduplicate by file_path + line span
    seen = set()
    uniq = []
    for d in all_docs:
        key = (d.get('file_path'), d.get('start_line'), d.get('end_line'))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(d)
    # Rerank union
    try:
        from rerank import rerank as ce_rerank
        reranked = ce_rerank(query, uniq, top_k=final_k)
        return reranked
    except Exception:
        return uniq[:final_k]
