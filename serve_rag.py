#!/usr/bin/env python3
"""Root shim: exports `app` from server.app for backward compatibility."""
from server.app import app  # noqa: F401

if __name__ == "__main__":
    # Optional direct run support
    import os
    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8012"))
    uvicorn.run("serve_rag:app", host=host, port=port)

