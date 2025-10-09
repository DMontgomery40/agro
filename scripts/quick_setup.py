#!/usr/bin/env python3
"""
Interactive quick setup to add the current working directory as a repo
and optionally index it. Run this from the ROOT of the repo you want to index.

Example:
  python /path/to/rag-service/scripts/quick_setup.py

Notes:
  - Writes/updates repos.json in the rag-service root
  - Asks before indexing (can be costly/time-consuming)
"""
import os
import sys
import json
import subprocess
from pathlib import Path

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.prompt import Confirm, Prompt
except Exception:
    print("This setup requires 'rich'. Install with: pip install rich", file=sys.stderr)
    sys.exit(1)

console = Console()


def write_repos_json(rag_root: Path, name: str, code_path: Path) -> Path:
    p = os.getenv('REPOS_FILE') or str(rag_root / 'repos.json')
    repos_path = Path(p)
    cfg = {'default_repo': name, 'repos': []}
    if repos_path.exists():
        try:
            cfg = json.loads(repos_path.read_text())
            if not isinstance(cfg, dict):
                cfg = {'default_repo': name, 'repos': []}
        except Exception:
            cfg = {'default_repo': name, 'repos': []}
    # Update or append
    repos = cfg.get('repos') or []
    found = False
    for r in repos:
        if (r.get('name') or '').strip().lower() == name.lower():
            r['path'] = str(code_path)
            found = True
            break
    if not found:
        repos.append({'name': name, 'path': str(code_path), 'keywords': [], 'path_boosts': [], 'layer_bonuses': {}})
    cfg['repos'] = repos
    # Ask to set default
    if Confirm.ask(f"Make [bold]{name}[/bold] the default repo?", default=True):
        cfg['default_repo'] = name
    repos_path.write_text(json.dumps(cfg, indent=2))
    return repos_path


def main():
    rag_root = Path(__file__).resolve().parents[1]
    code_root = Path(os.getcwd()).resolve()
    suggested = code_root.name.lower().replace(' ', '-').replace('_', '-')
    title = "RAG Service — Quick Setup"
    msg = (
        f"Detected current directory:\n[bold]{code_root}[/bold]\n\n"
        "Create or update repos.json to include this path?\n"
    )
    console.print(Panel(msg, title=title, border_style="cyan"))
    if not Confirm.ask("Add this repo?", default=True):
        console.print("[yellow]Canceled.[/yellow]")
        return
    name = Prompt.ask("Repository name", default=suggested)
    repos_path = write_repos_json(rag_root, name, code_root)
    console.print(f"[green]✓[/green] Updated {repos_path}")

    # Offer to index
    console.print(Panel(
        "Index now? This builds BM25 and embeddings; it may take time and bill your provider if configured.",
        title="Index Repository", border_style="yellow"
    ))
    if Confirm.ask("Start indexing now?", default=False):
        env = os.environ.copy()
        env['REPO'] = name
        try:
            subprocess.check_call([sys.executable, str(rag_root / 'index_repo.py')], env=env, cwd=str(rag_root))
            console.print(f"[green]✓[/green] Indexed repo: [bold]{name}[/bold]")
        except subprocess.CalledProcessError as e:
            console.print(f"[red]Indexing failed:[/red] {e}")
    else:
        console.print("[dim]Skipped indexing. Run later with:[/dim] REPO=%s python index_repo.py" % name)


if __name__ == '__main__':
    main()

