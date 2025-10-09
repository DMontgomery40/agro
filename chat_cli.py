#!/usr/bin/env python3
"""
Interactive CLI chat interface for RAG service.
Uses LangGraph with Redis checkpoints for conversation memory.

Usage:
    export REPO=<your repo name from repos.json>
    export THREAD_ID=my-session-1
    # Blocking (default, in-process)
    python chat_cli.py

    # Streaming via HTTP SSE (requires API running at RAG_API_URL or 127.0.0.1:8012)
    python chat_cli.py --stream [--api-url http://127.0.0.1:8012]

Commands:
    /repo <name>    - Switch repository (must be in repos.json)
    /setup          - Guided setup (add repo, deps, infra, agent registration)
    /save           - Save conversation checkpoint
    /clear          - Clear conversation history
    /help           - Show commands
    /exit, /quit    - Exit chat
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import urllib.parse, urllib.request

# Load environment
load_dotenv(Path(__file__).parent / ".env")

from langgraph_app import build_graph
from config_loader import get_default_repo, list_repos
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text
from rich.prompt import Prompt
from rich.prompt import Confirm

console = Console()

# Configuration
REPO = os.getenv('REPO', get_default_repo())
THREAD_ID = os.getenv('THREAD_ID', 'cli-chat')


class ChatCLI:
    """Interactive CLI chat with RAG."""

    def __init__(self, repo: str = None, thread_id: str = 'cli-chat', *, stream: bool = False, api_url: str | None = None):
        repo = repo or get_default_repo()
        self.repo = repo
        self.thread_id = thread_id
        self.stream_enabled = bool(stream)
        self.api_url = (api_url or os.getenv('RAG_API_URL') or 'http://127.0.0.1:8012').rstrip('/')
        self.graph = None
        self._init_graph()
        self._repos_known = list_repos()

    def _init_graph(self):
        """Initialize LangGraph with Redis checkpoints."""
        try:
            self.graph = build_graph()
            console.print(f"[green]✓[/green] Graph initialized with Redis checkpoints")
        except Exception as e:
            console.print(f"[red]✗[/red] Failed to initialize graph: {e}")
            sys.exit(1)

    def _get_config(self):
        """Get config for current thread."""
        return {"configurable": {"thread_id": self.thread_id}}

    def _format_answer(self, generation: str) -> str:
        """Format answer, removing repo header if present."""
        lines = generation.split('\n')
        # Remove [repo: ...] header if present
        if lines and lines[0].startswith('[repo:'):
            return '\n'.join(lines[1:]).strip()
        return generation

    def ask(self, question: str) -> dict:
        """Ask a question and get answer."""
        if self.stream_enabled:
            # Stream via HTTP SSE endpoint /answer_stream
            return self._ask_stream_http(question)
        # Pre-flight: detect available generation backend to avoid long waits
        backend = self._detect_generation_backend()
        if backend == 'none':
            msg = (
                "No generation backend configured. Set OPENAI_API_KEY for OpenAI Responses/Chat, "
                "or set OLLAMA_URL (and pull a local model) for local Qwen."
            )
            return {"generation": msg, "documents": [], "confidence": 0.0}
        try:
            state = {
                "question": question,
                "documents": [],
                "generation": "",
                "iteration": 0,
                "confidence": 0.0,
                "repo": self.repo
            }
            result = self.graph.invoke(state, self._get_config())
            return result
        except Exception as e:
            console.print(f"[red]Error:[/red] {e}")
            return {"generation": f"Error: {e}", "documents": [], "confidence": 0.0}

    def _detect_generation_backend(self) -> str:
        """Return 'ollama', 'openai', or 'none' based on quick checks."""
        try:
            ollama = os.getenv('OLLAMA_URL', '').strip()
            if ollama:
                tags = (ollama.rstrip('/') + '/tags')
                req = urllib.request.Request(tags)
                with urllib.request.urlopen(req, timeout=0.5) as resp:
                    if resp.status == 200:
                        return 'ollama'
        except Exception:
            pass
        if os.getenv('OPENAI_API_KEY', '').strip():
            return 'openai'
        return 'none'

    def _ask_stream_http(self, question: str) -> dict:
        """Stream answer over HTTP SSE, printing tokens as they arrive."""
        try:
            # Build URL
            q = urllib.parse.quote(question)
            repo = urllib.parse.quote(self.repo)
            url = f"{self.api_url}/answer_stream?q={q}&repo={repo}"
            req = urllib.request.Request(url)
            # Optional bearer token
            tok = os.getenv('OAUTH_TOKEN', '').strip()
            if tok:
                req.add_header('Authorization', f'Bearer {tok}')
            with urllib.request.urlopen(req) as resp:
                # Stream lines
                full = []
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    try:
                        s = line.decode('utf-8', errors='ignore')
                    except Exception:
                        continue
                    if not s.startswith('data:'):
                        continue
                    data = s[len('data:'):].strip()
                    if not data:
                        continue
                    if data == '[DONE]':
                        break
                    if data.startswith('[ERROR]'):
                        console.print(f"[red]{data}[/red]")
                        break
                    # Print streamed chunk
                    full.append(data)
                    console.print(data, end='')
                # Ensure newline after stream
                console.print("\n")
                return {"generation": ''.join(full), "documents": [], "confidence": 0.0}
        except Exception as e:
            console.print(f"[red]Streaming error:[/red] {e}")
            return {"generation": f"Error: {e}", "documents": [], "confidence": 0.0}

    def switch_repo(self, new_repo: str):
        """Switch to a different repository."""
        allowed = list_repos()
        if new_repo not in allowed:
            console.print(f"[red]✗[/red] Invalid repo. Use one of: {', '.join(allowed) or '[]'}")
            return

        self.repo = new_repo
        console.print(f"[green]✓[/green] Switched to repo: [bold]{new_repo}[/bold]")

    def show_help(self):
        """Show available commands."""
        allowed = ', '.join(list_repos()) or '(none configured)'
        help_text = f"""
## Commands

- `/repo <name>` - Switch repository (configured repos: {allowed})
- `/setup` - Guided setup (add repo, deps, infra, MCP registration)
- `/save` - Save conversation checkpoint
- `/clear` - Clear conversation history
- `/help` - Show this help
- `/exit`, `/quit` - Exit chat

## Examples

Ask a question:
```
> Where is OAuth token validated?
```

Switch repo:
```
> /repo faxbot
> How do we handle inbound faxes?
```
        """
        console.print(Markdown(help_text))

    def show_welcome(self):
        """Show welcome message."""
        welcome = (
            "# 🤖 RAG CLI Chat\n\n"
            f"Connected to: [bold cyan]{self.repo}[/bold cyan]\n"
            f"Thread ID: [bold]{self.thread_id}[/bold]\n\n"
            "Type your question or use `/help` for commands."
        )
        console.print(Panel(Text.from_markup(welcome), border_style="cyan"))
        if not self._repos_known:
            console.print(Panel(
                Text.from_markup(
                    "[yellow]No repositories configured.[/yellow]\n"
                    "Run [bold]/setup[/bold] to add your current project and register Codex/Claude."
                ),
                title="Setup needed", border_style="yellow"
            ))

    def run(self):
        """Main chat loop."""
        self.show_welcome()

        while True:
            try:
                # Get user input
                user_input = Prompt.ask(
                    f"\n[bold cyan]{self.repo}[/bold cyan] >",
                    default=""
                )

                if not user_input.strip():
                    continue

                # Handle commands
                if user_input.startswith('/'):
                    cmd = user_input.lower().split()[0]

                    if cmd in ['/exit', '/quit']:
                        console.print("[yellow]Goodbye![/yellow]")
                        break

                    elif cmd == '/help':
                        self.show_help()
                        continue

                    elif cmd == '/repo':
                        parts = user_input.split(maxsplit=1)
                        if len(parts) > 1:
                            self.switch_repo(parts[1].strip())
                        else:
                            console.print(f"[red]Usage:[/red] /repo <one of: {', '.join(list_repos())}>")
                        continue

                    elif cmd == '/setup':
                        try:
                            repo_path = Prompt.ask("Path to your code repo (absolute)", default=os.getcwd())
                            if not repo_path:
                                console.print("[yellow]Skipped setup.[/yellow]")
                                continue
                            repo_name = Prompt.ask("Repo name (optional)", default="")
                            args = [sys.executable, os.path.join(os.path.dirname(__file__), 'scripts', 'quick_setup.py')]
                            if repo_path:
                                args += ['--path', repo_path]
                            if repo_name:
                                args += ['--name', repo_name]
                            console.print("[dim]Running guided setup...[/dim]")
                            import subprocess
                            subprocess.check_call(args, cwd=os.path.dirname(__file__))
                        except subprocess.CalledProcessError as e:
                            console.print(f"[red]Setup failed:[/red] {e}")
                        except Exception as e:
                            console.print(f"[red]Error:[/red] {e}")
                        continue

                    elif cmd == '/save':
                        console.print(f"[green]✓[/green] Checkpoint saved (thread: {self.thread_id})")
                        continue

                    elif cmd == '/clear':
                        # Create new thread ID to start fresh
                        import time
                        self.thread_id = f"cli-chat-{int(time.time())}"
                        console.print(f"[green]✓[/green] Cleared history (new thread: {self.thread_id})")
                        continue

                    else:
                        console.print(f"[red]Unknown command:[/red] {cmd}")
                        console.print("Type [bold]/help[/bold] for available commands")
                        continue

                # Ask question
                console.print("[dim]Thinking...[/dim]")
                result = self.ask(user_input)

                # Show answer
                answer = self._format_answer(result.get('generation', ''))
                confidence = result.get('confidence', 0.0)
                docs = result.get('documents', [])

                # Display answer in panel
                if not self.stream_enabled:
                    console.print("\n")
                    console.print(Panel(
                        Markdown(answer),
                        title=f"Answer (confidence: {confidence:.2f})",
                        border_style="green" if confidence > 0.6 else "yellow"
                    ))
                else:
                    # Already streamed; show a small summary panel
                    console.print(Panel(
                        Markdown("(streamed)\n" + (answer[:200] + ('...' if len(answer) > 200 else ''))),
                        title=f"Answer (stream)",
                        border_style="cyan"
                    ))

                # Show top citations
                if docs:
                    console.print("\n[dim]Top sources:[/dim]")
                    for i, doc in enumerate(docs[:3], 1):
                        fp = doc.get('file_path', 'unknown')
                        start = doc.get('start_line', 0)
                        end = doc.get('end_line', 0)
                        score = doc.get('rerank_score', 0.0)
                        console.print(f"  [dim]{i}.[/dim] {fp}:{start}-{end} [dim](score: {score:.3f})[/dim]")

            except KeyboardInterrupt:
                console.print("\n[yellow]Use /exit to quit[/yellow]")
                continue
            except EOFError:
                console.print("\n[yellow]Goodbye![/yellow]")
                break
            except Exception as e:
                console.print(f"[red]Error:[/red] {e}")
                continue

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='RAG CLI Chat')
    parser.add_argument('--stream', action='store_true', help='Stream via HTTP SSE (requires API server)')
    parser.add_argument('--api-url', default=os.getenv('RAG_API_URL', 'http://127.0.0.1:8012'), help='API base URL for streaming')
    args = parser.parse_args()
    cli = ChatCLI(repo=REPO, thread_id=THREAD_ID, stream=args.stream, api_url=args.api_url)
    cli.run()
