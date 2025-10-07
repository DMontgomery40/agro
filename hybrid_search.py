import os, json, collections
from typing import List, Dict
from dotenv import load_dotenv
from qdrant_client import QdrantClient
import bm25s
from bm25s.tokenization import Tokenizer
from Stemmer import Stemmer
from rerank import rerank as ce_rerank

# Query intent → layer preferences
def _classify_query(q:str)->str:
    ql=(q or '').lower()
    if any(k in ql for k in ['ui','react','component','tsx','page','frontend','render','css']): return 'ui'
    if any(k in ql for k in ['notification','pushover','apprise','hubspot','provider','integration','adapter','webhook']): return 'integration'
    if any(k in ql for k in ['diagnostic','health','event log','phi','mask','hipaa','middleware','auth','token','oauth','hmac']): return 'server'
    if any(k in ql for k in ['sdk','client library','python sdk','node sdk']): return 'sdk'
    if any(k in ql for k in ['infra','asterisk','sip','t.38','ami','freeswitch','egress','cloudflared']): return 'infra'
    return 'server'

def _vivified_layer_bonus(layer:str,intent:str)->float:
    L=(layer or '').lower(); I=(intent or 'server').lower()
    table={'server':{'kernel':0.10,'plugin':0.04,'ui':0.00,'docs':0.00,'tests':0.00,'infra':0.02},
           'integration':{'plugin':0.12,'kernel':0.04,'ui':0.00,'docs':0.00,'tests':0.00,'infra':0.00},
           'ui':{'ui':0.12,'docs':0.06,'kernel':0.02,'plugin':0.02,'tests':0.00,'infra':0.00},
           'sdk':{'kernel':0.04,'docs':0.02},
           'infra':{'infra':0.12,'kernel':0.04}}
    return table.get(I,{}).get(L,0.0)

def _faxbot_layer_bonus(layer:str,intent:str)->float:
    L=(layer or '').lower(); I=(intent or 'server').lower()
    table={'server':{'server':0.10,'integration':0.06,'ui':0.00,'sdk':0.00,'infra':0.02,'docs':0.00},
           'integration':{'integration':0.12,'server':0.06,'ui':0.00,'sdk':0.00,'infra':0.02,'docs':0.00},
           'ui':{'ui':0.12,'docs':0.06,'server':0.02},
           'sdk':{'sdk':0.12,'server':0.04,'docs':0.02},
           'infra':{'infra':0.12,'server':0.04,'integration':0.04}}
    return table.get(I,{}).get(L,0.0)

def _provider_plugin_hint(fp:str, code:str)->float:
    fp=(fp or '').lower(); code=(code or '').lower()
    keys=['provider','providers','integration','adapter','webhook','pushover','apprise','hubspot']
    return 0.06 if any(k in fp or k in code for k in keys) else 0.0

def _origin_bonus(origin:str, mode:str)->float:
    origin = (origin or '').lower(); mode=(mode or 'prefer_first_party').lower()
    if mode == 'prefer_first_party':
        return 0.06 if origin=='first_party' else (-0.08 if origin=='vendor' else 0.0)
    if mode == 'prefer_vendor':
        return 0.06 if origin=='vendor' else 0.0
    return 0.0

def _feature_bonus(query:str, fp:str, code:str)->float:
    ql = (query or '').lower(); fp = (fp or '').lower(); code=(code or '').lower()
    bumps = 0.0
    if any(k in ql for k in ['diagnostic','health','event log','phi','hipaa']):
        if ('diagnostic' in fp) or ('diagnostic' in code) or ('event' in fp and 'log' in fp):
            bumps += 0.06
    return bumps

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
from sentence_transformers import SentenceTransformer

load_dotenv()
top_env = '/Users/davidmontgomery/rag-service/.env'
if os.path.exists(top_env):
    try:
        load_dotenv(dotenv_path=top_env, override=False)
    except Exception:
        pass
QDRANT_URL = os.getenv('QDRANT_URL','http://127.0.0.1:6333')
REPO = os.getenv('REPO','vivified')
VENDOR_MODE = os.getenv('VENDOR_MODE','prefer_first_party')
COLLECTION = f'code_chunks_{REPO}'

def rrf(dense: List[int], sparse: List[int], k: int = 10, kdiv: int = 60) -> List[int]:
    score = collections.defaultdict(float)
    for rank, pid in enumerate(dense, start=1): score[pid] += 1.0/(kdiv+rank)
    for rank, pid in enumerate(sparse, start=1): score[pid] += 1.0/(kdiv+rank)
    ranked = sorted(score.items(), key=lambda x:x[1], reverse=True)
    return [pid for pid,_ in ranked[:k]]

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

def search(query: str, topk_dense: int = 75, topk_sparse: int = 75, final_k: int = 10) -> List[Dict]:
    chunks = _load_chunks()
    if not chunks: return []

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
        dres = qc.query_points(collection_name=coll, query=e, using='dense', limit=topk_dense, with_payload=True)
        dense_pairs = [(str(p.id), dict(p.payload)) for p in getattr(dres, "points", dres)]
    except Exception:
        dense_pairs = []

    # ---- Sparse (BM25S) ----
    idx_dir = os.path.join(os.path.dirname(__file__), 'out', REPO, 'bm25_index')
    retriever = bm25s.BM25.load(idx_dir)
    tokenizer = Tokenizer(stemmer=Stemmer('english'), stopwords='en')
    tokens = tokenizer.tokenize([query])
    ids, scores = retriever.retrieve(tokens, k=topk_sparse)
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
                # Use the key directly if it matches chunk ids, else fallback to corpus order
                if key in by_chunk_id:
                    sparse_pairs.append((key, by_chunk_id[key]))
        else:
            # fallback to corpus order alignment
            if 0 <= i < len(chunks):
                sparse_pairs.append((str(chunks[i]['id']), chunks[i]))

    # Fuse
    dense_ids = [pid for pid,_ in dense_pairs]
    sparse_ids = [pid for pid,_ in sparse_pairs]
    fused = rrf(dense_ids, sparse_ids, k=max(final_k, 2*final_k)) if dense_pairs else sparse_ids[:final_k]
    by_id = {pid: p for pid,p in (dense_pairs + sparse_pairs)}
    docs = [by_id[pid] for pid in fused if pid in by_id]
    docs = ce_rerank(query, docs, top_k=final_k)
    # Apply path + layer intent + provider + feature + (optional) origin bonuses, then resort
    intent = _classify_query(query)
    for d in docs:
        layer_bonus = _vivified_layer_bonus(d.get('layer',''), intent) if REPO=='vivified' else _faxbot_layer_bonus(d.get('layer',''), intent)
        origin_bonus = _origin_bonus(d.get('origin',''), VENDOR_MODE) if 'VENDOR_MODE' in os.environ else 0.0
        d['rerank_score'] = float(
            d.get('rerank_score', 0.0)
            + _path_bonus(d.get('file_path', ''))
            + layer_bonus
            + _provider_plugin_hint(d.get('file_path', ''), d.get('code', '')[:1000])
            + _feature_bonus(query, d.get('file_path',''), d.get('code','')[:800])
            + origin_bonus
        )
    docs.sort(key=lambda x: x.get('rerank_score', 0.0), reverse=True)
    return docs[:final_k]

# --- Strict per-repo routing helpers (no fusion) ---
def route_repo(query: str, default_repo: str = None) -> str:
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
    return (default_repo or os.getenv('REPO','vivified')).strip()

def search_routed(query: str, repo_override: str = None, final_k: int = 10):
    global REPO
    prev = REPO
    REPO = (repo_override or route_repo(query, default_repo=prev) or prev).strip()
    try:
        return search(query, final_k=final_k)
    finally:
        REPO = prev
