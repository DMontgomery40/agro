# coding: utf-8

PRUNE_DIRS = {
    '.git', '.worktrees', '.venv', 'venv', 'env', '.venv_ci',
    'node_modules', 'vendor', 'dist', 'build',
    '.next', '.turbo', '.svelte-kit', 'coverage',
    'site', '_site', '__pycache__', '.pytest_cache', '.mypy_cache', '.cache'
}

VALID_EXTS = (
    '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java', '.c', '.cpp',
    '.md', '.mdx', '.yaml', '.yml', '.toml', '.json'
)

SKIP_EXTS = ('.map', '.pyc', '.ds_store')

def _should_index_file(name):
    n = name.lower()
    if n.endswith(SKIP_EXTS):
        return False
    return n.endswith(VALID_EXTS)

def _prune_dirs_in_place(dirs):
    # remove noisy dirs without descending into them
    dirs[:] = [d for d in dirs if d not in PRUNE_DIRS]

