import os
import json
import hashlib
from typing import List, Dict
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from ast_chunker import lang_from_path, collect_files, chunk_code
import bm25s
from bm25s.tokenization import Tokenizer
from Stemmer import Stemmer
from qdrant_client import QdrantClient, models
import uuid
from openai import OpenAI
from embed_cache import EmbeddingCache
import tiktoken
from sentence_transformers import SentenceTransformer

# Load local env and also repo-root .env if present (no hard-coded paths)
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
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if OPENAI_API_KEY and OPENAI_API_KEY.strip().upper() in {"SK-REPLACE", "REPLACE"}:
    OPENAI_API_KEY = None
QDRANT_URL = os.getenv('QDRANT_URL','http://127.0.0.1:6333')
# Repo scoping
REPO = os.getenv('REPO', 'vivified').strip()
_BASES = {
    'vivified': ['/Users/davidmontgomery/faxbot_folder/vivified'],
    'faxbot': ['/Users/davidmontgomery/faxbot_folder/faxbot'],
}
BASES = _BASES.get(REPO, _BASES['vivified'])
OUTDIR = f'/Users/davidmontgomery/faxbot_folder/rag-service/out/{REPO}'
COLLECTION = f'code_chunks_{REPO}'


# --- Repo-aware layer tagging ---
def detect_layer(fp: str) -> str:
    f = (fp or '').lower()
    if REPO == 'vivified':
        if '/core/admin_ui/' in f or '/site/' in f or '/docs-site/' in f:
            return 'ui'
        if '/plugins/' in f or '/core/plugins/' in f or 'notification' in f or 'pushover' in f or 'apprise' in f:
            return 'plugin'
        if '/core/api/' in f or '/core/' in f or '/server' in f:
            return 'kernel'
        if '/docs/' in f or '/internal_docs/' in f:
            return 'docs'
        if '/tests/' in f or '/test_' in f:
            return 'tests'
        if '/infra/' in f or '/deploy/' in f or '/scripts/' in f:
            return 'infra'
        return 'kernel'
    else:
        if '/admin_ui/' in f or '/site/' in f or '/docs-site/' in f:
            return 'ui'
        if 'provider' in f or 'providers' in f or 'integration' in f or 'webhook' in f or 'adapter' in f:
            return 'integration'
        if '/api/' in f or '/backends/' in f or '/server' in f:
            return 'server'
        if '/sdks/' in f or '/python_mcp/' in f or '/node_mcp/' in f or '/plugin-dev-kit/' in f:
            return 'sdk'
        if '/docs/' in f or '/internal_docs/' in f:
            return 'docs'
        if '/asterisk/' in f or '/config/' in f or '/infra/' in f:
            return 'infra'
        return 'server'

VENDOR_MARKERS = (
    "/vendor/","/third_party/","/external/","/deps/","/node_modules/",
    "/Pods/","/Godeps/","/.bundle/","/bundle/"
)
def detect_origin(fp: str) -> str:
    low = (fp or '').lower()
    for m in VENDOR_MARKERS:
        if m in low:
            return 'vendor'
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            head = ''.join([next(f) for _ in range(12)])
        if any(k in head.lower() for k in (
            'apache license','mit license','bsd license','mozilla public license'
        )):
            return 'vendor'
    except Exception:
        pass
    return 'first_party'
os.makedirs(OUTDIR, exist_ok=True)

def _clip_for_openai(text: str, enc, max_tokens: int = 8000) -> str:
    toks = enc.encode(text)
    if len(toks) <= max_tokens:
        return text
    return enc.decode(toks[:max_tokens])

def embed_texts(client: OpenAI, texts: List[str], batch: int = 64) -> List[List[float]]:
    # Legacy non-cached embedder (kept for compatibility if needed)
    embs = []
    enc = tiktoken.get_encoding('cl100k_base')
    for i in range(0, len(texts), batch):
        sub = [_clip_for_openai(t, enc) for t in texts[i:i+batch]]
        r = client.embeddings.create(model='text-embedding-3-large', input=sub)
        for d in r.data:
            embs.append(d.embedding)
    return embs

def embed_texts_local(texts: List[str], model_name: str = 'BAAI/bge-small-en-v1.5', batch: int = 128) -> List[List[float]]:
    model = SentenceTransformer(model_name)
    out = []
    for i in range(0, len(texts), batch):
        sub = texts[i:i+batch]
        v = model.encode(sub, normalize_embeddings=True, show_progress_bar=False)
        out.extend(v.tolist())
    return out

def main() -> None:
    files = collect_files(BASES)
    print(f'Discovered {len(files)} source files.')
    all_chunks: List[Dict] = []
    for fp in files:
        lang = lang_from_path(fp)
        if not lang:
            continue
        try:
            with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                src = f.read()
        except Exception:
            continue
        ch = chunk_code(src, fp, lang, target=900)
        all_chunks.extend(ch)

    seen, chunks = set(), []
    for c in all_chunks:
        c['repo'] = REPO
        try:
            c['layer'] = detect_layer(c.get('file_path',''))
        except Exception:
            c['layer'] = 'server'
        try:
            c['origin'] = detect_origin(c.get('file_path',''))
        except Exception:
            c['origin'] = 'first_party'
        h = hashlib.md5(c['code'].encode()).hexdigest()
        if h in seen:
            continue
        seen.add(h)
        c['hash'] = h
        chunks.append(c)
    print(f'Prepared {len(chunks)} chunks.')

    # BM25S index
    corpus: List[str] = []
    for c in chunks:
        pre = []
        if c.get('name'):
            pre += [c['name']]*2
        if c.get('imports'):
            pre += [i[0] or i[1] for i in c['imports'] if isinstance(i, (list, tuple))]
        body = c['code']
        corpus.append((' '.join(pre)+'\n'+body).strip())

    stemmer = Stemmer('english')
    tokenizer = Tokenizer(stemmer=stemmer, stopwords='en')
    corpus_tokens = tokenizer.tokenize(corpus)
    retriever = bm25s.BM25(method='lucene', k1=1.2, b=0.65)
    retriever.index(corpus_tokens)
    os.makedirs(os.path.join(OUTDIR, 'bm25_index'), exist_ok=True)
    # Workaround: ensure JSON-serializable vocab keys
    try:
        retriever.vocab_dict = {str(k): v for k, v in retriever.vocab_dict.items()}
    except Exception:
        pass
    retriever.save(os.path.join(OUTDIR, 'bm25_index'), corpus=corpus)
    tokenizer.save_vocab(save_dir=os.path.join(OUTDIR, 'bm25_index'))
    tokenizer.save_stopwords(save_dir=os.path.join(OUTDIR, 'bm25_index'))
    with open(os.path.join(OUTDIR, 'bm25_index', 'corpus.txt'), 'w', encoding='utf-8') as f:
        for doc in corpus:
            f.write(doc.replace('\n','\\n')+'\n')
    # Persist a stable mapping from BM25 doc index -> chunk id
    # Persist mapping from BM25 doc index -> chunk id (string)
    chunk_ids = [str(c['id']) for c in chunks]
    with open(os.path.join(OUTDIR, 'bm25_index', 'chunk_ids.txt'), 'w', encoding='utf-8') as f:
        for cid in chunk_ids:
            f.write(cid+'\n')
    # Also write a JSON map for convenience
    import json as _json
    _json.dump({str(i): cid for i, cid in enumerate(chunk_ids)}, open(os.path.join(OUTDIR,'bm25_index','bm25_map.json'),'w'))
    with open(os.path.join(OUTDIR,'chunks.jsonl'),'w',encoding='utf-8') as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False)+'\n')
    print('BM25 index saved.')

    client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
    texts = [c['code'] for c in chunks]
    embs: List[List[float]] = []
    if client is not None:
        try:
            cache = EmbeddingCache(OUTDIR)
            hashes = [c['hash'] for c in chunks]
            embs = cache.embed_texts(client, texts, hashes, model='text-embedding-3-large', batch=64)
            cache.save()
        except Exception as e:
            print(f'Embedding via OpenAI failed ({e}); falling back to local embeddings.')
    if not embs:
        embs = embed_texts_local(texts)
    q = QdrantClient(url=QDRANT_URL)
    q.recreate_collection(
        collection_name=COLLECTION,
        vectors_config={'dense': models.VectorParams(size=len(embs[0]), distance=models.Distance.COSINE)}
    )
    points = []
    point_ids: List[str] = []
    for c, v in zip(chunks, embs):
        # Derive a stable UUID from the chunk id string to satisfy Qdrant (expects int or UUID)
        cid = str(c['id'])
        pid = str(uuid.uuid5(uuid.NAMESPACE_DNS, cid))
        # Create slim payload without code (code is stored locally in chunks.jsonl)
        slim_payload = {
            'id': c.get('id'),
            'file_path': c.get('file_path'),
            'start_line': c.get('start_line'),
            'end_line': c.get('end_line'),
            'layer': c.get('layer'),
            'repo': c.get('repo'),
            'origin': c.get('origin'),
            'hash': c.get('hash'),
            'language': c.get('language')
        }
        # Remove None values to keep payload minimal
        slim_payload = {k: v for k, v in slim_payload.items() if v is not None}
        points.append(models.PointStruct(id=pid, vector={'dense': v}, payload=slim_payload))
        point_ids.append(pid)
        if len(points) == 64:
            q.upsert(COLLECTION, points=points)
            points = []
    if points:
        q.upsert(COLLECTION, points=points)
    # Persist point id mapping aligned to BM25 corpus order
    import json as _json
    _json.dump({str(i): pid for i, pid in enumerate(point_ids)}, open(os.path.join(OUTDIR,'bm25_index','bm25_point_ids.json'),'w'))
    print(f'Indexed {len(chunks)} chunks to Qdrant (embeddings: {len(embs[0])} dims).')

if __name__ == '__main__':
    main()
