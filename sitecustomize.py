# Python auto-imports sitecustomize at startup if present in sys.path.
# We use it to block legacy Chat Completions usage at runtime.
try:
    import openai  # type: ignore

    def _blocked(*_args, **_kwargs):  # noqa: D401
        raise RuntimeError(
            "Legacy Chat Completions API is disabled. Use Responses API via env_model.generate_text().\n"
            "Docs: https://openai.com/index/new-tools-and-features-in-the-responses-api/"
        )

    # Block classic patterns if present on this installed version
    if hasattr(openai, "ChatCompletion"):
        try:
            openai.ChatCompletion.create = staticmethod(_blocked)  # type: ignore[attr-defined]
        except Exception:
            pass
    # Some older clients expose nested chat.completions
    if hasattr(openai, "chat"):
        chat = getattr(openai, "chat")
        if hasattr(chat, "completions"):
            try:
                chat.completions.create = _blocked  # type: ignore[attr-defined]
            except Exception:
                pass
except Exception:
    # If openai not installed yet, do nothing.
    pass

