import os
import json

# MLX backend (default for Apple Silicon)
ENRICH_BACKEND = os.getenv("ENRICH_BACKEND", "mlx").lower()  # mlx | ollama
MLX_MODEL = os.getenv("ENRICH_MODEL", "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("ENRICH_MODEL_OLLAMA", "qwen3-coder:30b")

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
    else:
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

    # Parse JSON response
    try:
        data = json.loads(txt)
        if isinstance(data, dict):
            return {"summary": data.get("summary", ""), "keywords": data.get("keywords", [])}
    except Exception:
        pass
    return {"summary": txt[:300], "keywords": []}

