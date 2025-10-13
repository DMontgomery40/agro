from common.metadata import *  # noqa: F401,F403
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
