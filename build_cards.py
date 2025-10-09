import os, json
from typing import Dict
from dotenv import load_dotenv
from env_model import generate_text
from config_loader import get_default_repo, out_dir

load_dotenv()
REPO = (os.getenv('REPO') or get_default_repo()).strip()
MAX_CHUNKS = int(os.getenv('CARDS_MAX','0') or '0')
BASE = out_dir(REPO)
CHUNKS = os.path.join(BASE, 'chunks.jsonl')
CARDS = os.path.join(BASE, 'cards.jsonl')
CARDS_TXT = os.path.join(BASE, 'cards.txt')
INDEX_DIR = os.path.join(BASE, 'bm25_cards')

PROMPT = (
    "Summarize this code chunk for retrieval as a JSON object with keys: "
    "symbols (array of names: functions/classes/components/routes), purpose (short sentence), "
    "routes (array of route paths if any). Respond with only the JSON.\n\n"
)

def iter_chunks():
    with open(CHUNKS, 'r', encoding='utf-8') as f:
        for line in f:
            o = json.loads(line)
            yield o

def main():
    os.makedirs(BASE, exist_ok=True)
    # Responses API via env_model.generate_text
    n = 0
    with open(CARDS, 'w', encoding='utf-8') as out_json, open(CARDS_TXT, 'w', encoding='utf-8') as out_txt:
        for ch in iter_chunks():
            code = ch.get('code','')
            fp = ch.get('file_path','')
            snippet = code[:2000]
            msg = PROMPT + snippet
            try:
                text, _ = generate_text(user_input=msg, system_instructions=None, reasoning_effort=None, response_format={"type": "json_object"})
                content = (text or '').strip()
                card: Dict = json.loads(content) if content else {"symbols": [], "purpose": "", "routes": []}
            except Exception:
                card = {"symbols": [], "purpose": "", "routes": []}
            card['file_path'] = fp
            card['id'] = ch.get('id')
            out_json.write(json.dumps(card, ensure_ascii=False) + '\n')
            # Text for BM25
            text = ' '.join(card.get('symbols', [])) + '\n' + card.get('purpose','') + '\n' + ' '.join(card.get('routes', [])) + '\n' + fp
            out_txt.write(text.replace('\n',' ') + '\n')
            n += 1
            if MAX_CHUNKS and n >= MAX_CHUNKS:
                break
    # Build BM25 over cards text
    try:
        import bm25s
        from bm25s.tokenization import Tokenizer
        from Stemmer import Stemmer
        stemmer = Stemmer('english'); tok = Tokenizer(stemmer=stemmer, stopwords='en')
        with open(CARDS_TXT,'r',encoding='utf-8') as f:
            docs = [line.strip() for line in f if line.strip()]
        tokens = tok.tokenize(docs)
        retriever = bm25s.BM25(method='lucene', k1=1.2, b=0.65)
        retriever.index(tokens)
        # Workaround: ensure JSON-serializable vocab keys
        try:
            retriever.vocab_dict = {str(k): v for k, v in retriever.vocab_dict.items()}
        except Exception:
            pass
        os.makedirs(INDEX_DIR, exist_ok=True)
        retriever.save(INDEX_DIR, corpus=docs)
        tok.save_vocab(save_dir=INDEX_DIR)
        tok.save_stopwords(save_dir=INDEX_DIR)
        print(f"Built cards BM25 index with {len(docs)} docs at {INDEX_DIR}")
    except Exception as e:
        print('BM25 build failed:', e)

if __name__ == '__main__':
    main()
