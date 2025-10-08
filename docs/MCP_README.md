# MCP Integration for RAG Service

This document describes the Model Context Protocol (MCP) integration that allows Codex and other AI agents to directly query the RAG system.

## Overview

The MCP server (`mcp_server.py`) exposes two tools:

1. **`rag_answer(repo, question)`** → Full LangGraph pipeline with answer + citations
2. **`rag_search(repo, question, top_k=10)`** → Retrieval-only (debugging)

## Setup

### 1. Prerequisites

- Python virtualenv activated: `. .venv/bin/activate`
- Infrastructure running: Qdrant + Redis via Docker Compose
- At least one repo indexed: `REPO=vivified python index_repo.py` 
- Ideally both: 'REPO=faxbot python index_repo.py'
- Codex CLI installed: `brew install openai/tap/codex` or `npm install -g @openai/codex`

### 2. Register MCP Server with Codex

```bash
codex mcp add faxbot-rag -- \
  /Users/davidmontgomery/faxbot_folder/rag-service/.venv/bin/python \
  /Users/davidmontgomery/faxbot_folder/rag-service/mcp_server.py
```

Verify registration:
```bash
codex mcp list
# Should show: faxbot-rag
```

### 3. Test MCP Server (Manual)

Test the protocol directly:

```bash
. .venv/bin/activate

# Test tools/list
python -c "
import json
from mcp_server import MCPServer
req = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list', 'params': {}}
server = MCPServer()
print(json.dumps(server.handle_request(req), indent=2))
"
```

## Usage from Codex

Once registered, Codex can natively call these tools:

### Example 1: Ask a question

In a Codex chat session:

```
User: Use rag_answer to find where OAuth tokens are validated in vivified

Codex will call:
  rag_answer(repo="vivified", question="Where is OAuth token validated?")

Returns:
{
  "answer": "[repo: vivified]\nOAuth tokens are validated in...",
  "citations": [
    "identity/auth/oauth.py:42-67",
    "identity/middleware/token.py:89-120"
  ],
  "repo": "vivified",
  "confidence": 0.78
}
```

### Example 2: Debug retrieval

```
User: Use rag_search to see what code comes up for "inbound fax handling" in faxbot

Codex will call:
  rag_search(repo="faxbot", question="How do we handle inbound faxes?", top_k=5)

Returns:
{
  "results": [
    {
      "file_path": "app/controllers/faxes_controller.rb",
      "start_line": 45,
      "end_line": 89,
      "language": "ruby",
      "rerank_score": 0.82,
      "repo": "faxbot"
    },
    ...
  ],
  "repo": "faxbot",
  "count": 5
}
```

## Agent Rules (Codex Behavior)

These rules are documented in [`AGENTS.md`](AGENTS.md) and should be enforced:

1. **Never assume the user is wrong** about file paths, function names, or code locations
2. **Always call RAG tools first** before claiming something doesn't exist
3. **Never hallucinate file paths** — use retrieval results as ground truth
4. **Respect repo boundaries** — vivified and faxbot are separate; never fuse them
5. **Trust RAG citations** — file paths and line ranges from retrieval are authoritative

## Eval Loop

Run continuous evaluation to track retrieval quality:

```bash
. .venv/bin/activate

# Run eval once
python eval_loop.py

# Save baseline
python eval_loop.py --baseline

# Compare against baseline
python eval_loop.py --compare

# Watch mode (re-run on changes)
python eval_loop.py --watch

# JSON output
python eval_loop.py --json
```

### Adding Golden Test Cases

Edit `golden.json`:

```json
[
  {
    "q": "Where is ProviderSetupWizard rendered?",
    "repo": "vivified",
    "expect_paths": ["ProviderSetupWizard", "admin_ui", "components"]
  },
  {
    "q": "How do we queue outbound fax jobs?",
    "repo": "faxbot",
    "expect_paths": ["app/", "job", "fax", "outbound"]
  }
]
```

The `expect_paths` uses substring matching — any result containing one of these substrings counts as a hit.

## Architecture

```
┌─────────────────┐
│  Codex / Agent  │
└────────┬────────┘
         │ MCP (stdio)
         ▼
┌─────────────────────┐
│  mcp_server.py      │
│  ┌───────────────┐  │
│  │ rag_answer    │──┼──> langgraph_app.py
│  │ rag_search    │──┼──> hybrid_search.py
│  └───────────────┘  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Qdrant + Redis     │  (Docker Compose)
│  BM25 + Embeddings  │
└─────────────────────┘
```

## Troubleshooting

### "Graph not initialized"

- Check that Redis is running: `docker exec rag-redis redis-cli ping`
- Check that Qdrant is running: `curl -s http://127.0.0.1:6333/collections`
- Verify `.env` has `OPENAI_API_KEY`, `REDIS_URL`, `QDRANT_URL`

### "No results returned"

- Ensure repo is indexed: `REPO=vivified python index_repo.py`
- Check collections exist: `curl -s http://127.0.0.1:6333/collections | jq`
- Try search directly: `python -c "from hybrid_search import search_routed; print(search_routed('test', repo_override='vivified'))"`

### "Codex can't find the tools"

- Verify registration: `codex mcp list`
- Re-register if needed: `codex mcp remove faxbot-rag && codex mcp add faxbot-rag -- ...`
- Check Codex config: `cat ~/.codex/config.toml | grep mcp`

## References

- [Codex MCP docs](https://developers.openai.com/codex/mcp/)
- [MCP specification](https://modelcontextprotocol.io/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [AgentKit announcement](https://openai.com/index/introducing-agentkit/)
