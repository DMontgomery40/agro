import os
import json

# Backends: mlx | ollama | openai
ENRICH_BACKEND = os.getenv("ENRICH_BACKEND", "mlx").lower()

# MLX (local)
MLX_MODEL = os.getenv("ENRICH_MODEL", "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit")

# Ollama (local)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("ENRICH_MODEL_OLLAMA", "qwen3-coder:30b")

# OpenAI (cloud)
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("ENRICH_MODEL_OPENAI") or os.getenv("GEN_MODEL") or "gpt-4o-mini"

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

# Lazy-load MLX model (only once)
_mlx_model = None
_mlx_tokenizer = None

def _get_mlx_model():
    global _mlx_model, _mlx_tokenizer
    if _mlx_model is None:
        from mlx_lm import load
        _mlx_model, _mlx_tokenizer = load(MLX_MODEL)
    return _mlx_model, _mlx_tokenizer

def enrich(file_path: str, lang: str, code: str) -> dict:
    prompt = PROMPT_TMPL.format(file=file_path, lang=lang, code=(code or '')[:4000])

    if ENRICH_BACKEND == "mlx":
        # MLX backend (Apple Silicon, fast)
        try:
            from mlx_lm import generate
            model, tokenizer = _get_mlx_model()
            txt = generate(model, tokenizer, prompt=prompt, max_tokens=150, verbose=False)
        except Exception as e:
            return {"summary": f"MLX error: {str(e)[:100]}", "keywords": []}
    elif ENRICH_BACKEND == "ollama":
        # Ollama backend (fallback)
        import requests
        try:
            resp = requests.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_ctx": 4096},
                },
                timeout=10,
            )
            resp.raise_for_status()
            txt = resp.json().get("response", "{}")
        except Exception as e:
            return {"summary": f"Ollama error: {str(e)[:100]}", "keywords": []}
    else:
        # OpenAI backend (cloud)
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL) if OPENAI_BASE_URL else OpenAI(api_key=OPENAI_API_KEY)
            msgs = [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt},
            ]
            r = client.chat.completions.create(model=OPENAI_MODEL, messages=msgs, temperature=0.1, max_tokens=200)
            txt = r.choices[0].message.content or "{}"
        except Exception as e:
            return {"summary": f"OpenAI error: {str(e)[:100]}", "keywords": []}

    # Parse JSON response
    # Parse JSON response; if model returned plain text, fallback to capturing tokens
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            kws = data.get("keywords") or []
            if isinstance(kws, str):
                try:
                    kws = json.loads(kws)
                except Exception:
                    kws = [w.strip() for w in kws.split(',') if w.strip()]
            return {"summary": data.get("summary", ""), "keywords": kws}
    except Exception:
        pass
    # heuristic fallback: extract potential keywords from text
    import re as _re
    toks = [t.lower() for t in _re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b", txt or "")][:15]
    return {"summary": (txt or "")[:300], "keywords": toks}
