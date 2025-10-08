import os
import json
from typing import Optional, Dict, Any, Tuple

try:
    from openai import OpenAI
except Exception as e:
    raise RuntimeError("openai>=1.x is required for Responses API") from e

# Model pin (Responses API): default to OpenAI gpt-4o-mini-latest
# Default to a valid, stable alias. Users may override with a dated pin
# (e.g., gpt-4o-mini-2024-07-18) or another provider via GEN_MODEL.
_DEFAULT_MODEL = os.getenv("GEN_MODEL", "gpt-4o-mini-latest")

_client = None


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def _extract_text(resp: Any) -> str:
    # Prefer .output_text if present (library convenience), else parse the structure
    txt = ""
    if hasattr(resp, "output_text") and isinstance(getattr(resp, "output_text"), str):
        txt = resp.output_text
        if txt:
            return txt
    try:
        # Fallback path: resp.output[0].content[0].text
        out = getattr(resp, "output", None)
        if out and len(out) > 0:
            cont = getattr(out[0], "content", None)
            if cont and len(cont) > 0 and hasattr(cont[0], "text"):
                return cont[0].text or ""
    except Exception:
        pass
    return txt or ""


def generate_text(
    user_input: str,
    *,
    system_instructions: Optional[str] = None,
    model: Optional[str] = None,
    reasoning_effort: Optional[str] = None,  # e.g., "low" | "medium" | "high"
    response_format: Optional[Dict[str, Any]] = None,  # e.g., {"type":"json_object"}
    store: bool = False,
    previous_response_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Any]:
    """
    Minimal wrapper over Responses API:
      - Uses 'instructions' for system prompt and 'input' for user text
      - Supports response_format (JSON mode / structured)
      - Leaves tool-calling to upstream if needed (MCP/file_search handled elsewhere)
    """
    mdl = model or _DEFAULT_MODEL
    kwargs: Dict[str, Any] = {
        "model": mdl,
        "input": user_input,
        "store": store,
    }
    if system_instructions:
        kwargs["instructions"] = system_instructions
    if reasoning_effort:
        kwargs["reasoning"] = {"effort": reasoning_effort}
    if response_format:
        kwargs["response_format"] = response_format
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id
    if extra:
        kwargs.update(extra)

    resp = client().responses.create(**kwargs)
    text = _extract_text(resp)
    return text, resp
