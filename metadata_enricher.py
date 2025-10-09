import os
import json
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL = os.getenv("ENRICH_MODEL", "qwen3-coder:30b")

SYSTEM = (
    "You are a senior code analyst. Extract: 1) concise summary of purpose, "
    "2) key APIs/classes/functions referenced, 3) inputs/outputs/side-effects, "
    "4) 8-15 retrieval keywords (snake_case). Keep under 120 tokens."
)

PROMPT_TMPL = (
    "<system>" + SYSTEM + "</system>\n"
    "<analyze file='{file}' lang='{lang}'>\n{code}\n</analyze>\n"
    "<format>JSON with keys: summary, keywords</format>"
)


def enrich(file_path: str, lang: str, code: str) -> dict:
    prompt = PROMPT_TMPL.format(file=file_path, lang=lang, code=(code or '')[:4000])
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_ctx": 4096},
        },
        timeout=120,
    )
    resp.raise_for_status()
    txt = resp.json().get("response", "{}")
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            return {"summary": data.get("summary", ""), "keywords": data.get("keywords", [])}
    except Exception:
        pass
    return {"summary": txt[:300], "keywords": []}

