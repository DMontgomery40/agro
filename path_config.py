from __future__ import annotations

import os
from pathlib import Path


def _as_dir(p: str | Path | None) -> Path:
    if not p:
        return Path("")
    pp = Path(str(p)).expanduser()
    return pp if pp.is_absolute() else Path(__file__).resolve().parent / pp


def repo_root() -> Path:
    """Resolve repository root directory.

    Order of precedence:
    - REPO_ROOT environment variable (absolute or relative to this file)
    - Directory containing this file (project root for packaged server)
    """
    env = os.getenv("REPO_ROOT")
    if env:
        return _as_dir(env)
    # Default: assume this module lives at repo root
    return Path(__file__).resolve().parent


def files_root() -> Path:
    """Root for /files static mount."""
    return _as_dir(os.getenv("FILES_ROOT")) or repo_root()


def gui_dir() -> Path:
    env = os.getenv("GUI_DIR")
    return _as_dir(env) if env else (repo_root() / "gui")


def docs_dir() -> Path:
    env = os.getenv("DOCS_DIR")
    return _as_dir(env) if env else (repo_root() / "docs")


def data_dir() -> Path:
    env = os.getenv("DATA_DIR")
    return _as_dir(env) if env else (repo_root() / "data")

