# Quick Start: MCP + Codex Integration

## What Got Implemented ✓

1. **MCP Server** (`mcp_server.py`) - stdio-based tool server
2. **Two RAG Tools**:
   - `rag_answer(repo, question)` → full answer + citations
   - `rag_search(repo, question, top_k)` → retrieval only
3. **Codex Registration** - Already registered as `faxbot-rag`
4. **Agent Rules** - Updated in `AGENTS.md`
5. **Eval Loop** - `eval_loop.py` with baselines and regression tracking
6. **Golden Tests** - `golden.json` with 10 test cases

## Quick Commands

### Check MCP Registration
```bash
codex mcp list
# Should show: faxbot-rag
```

### Test MCP Tools Manually
```bash
. .venv/bin/activate

# List available tools
python -c "
from mcp_server import MCPServer
import json
req = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list', 'params': {}}
print(json.dumps(MCPServer().handle_request(req)['result']['tools'], indent=2))
"
```

### Run Evals
```bash
. .venv/bin/activate

# Run once
python eval_loop.py

# Save baseline
python eval_loop.py --baseline

# Compare vs baseline
python eval_loop.py --compare

# Watch mode (auto re-run on changes)
python eval_loop.py --watch
```

### Use in Codex Chat

Open a new Codex session and try:

```
User: Use rag_search to find code related to "OAuth token validation" in vivified

User: Use rag_answer to explain how inbound faxes are processed in faxbot
```

Codex will automatically call the registered MCP tools and display results.

## Architecture

```
Codex CLI
    ↓ (MCP stdio)
mcp_server.py
    ├─→ rag.answer → langgraph_app.py → hybrid_search.py
    └─→ rag.search → hybrid_search.py
                          ↓
                  Qdrant + Redis + BM25
                          ↓
                  out/vivified/chunks.jsonl
                  out/faxbot/chunks.jsonl
```

## Agent Behavior Rules

These are now documented in `AGENTS.md`:

1. ✗ Never assume user is wrong about paths/functions
2. ✓ Always call RAG tools first before claiming something doesn't exist
3. ✗ Never hallucinate file paths
4. ✓ Respect repo boundaries (vivified ≠ faxbot)
5. ✓ Trust RAG citations as authoritative

## Files Created

| File | Purpose | Size |
|------|---------|------|
| `mcp_server.py` | MCP stdio server | 11KB |
| `eval_loop.py` | Eval harness with regression tracking | 8KB |
| `golden.json` | Test cases (10 questions) | 1.4KB |
| `MCP_README.md` | Full documentation | 5.5KB |
| `test_mcp.sh` | Manual test script | 2.8KB |

## Next Steps

1. **Add more golden test cases** to `golden.json`
2. **Run baseline**: `python eval_loop.py --baseline`
3. **Try in Codex**: Open chat and use `rag_answer` or `rag_search`
4. **Monitor regressions**: `python eval_loop.py --watch` (runs on code changes)

## Troubleshooting

**"Graph not initialized"**
- Check infra: `docker compose -f ../infra/docker-compose.yml ps`
- Check Redis: `docker exec rag-redis redis-cli ping`
- Check Qdrant: `curl -s http://127.0.0.1:6333/collections`

**"No results"**
- Index repos: `REPO=vivified python index_repo.py`
- Verify collections: `curl -s http://127.0.0.1:6333/collections | jq`

**"Codex can't find tools"**
- Re-register: `codex mcp remove faxbot-rag && codex mcp add faxbot-rag -- .venv/bin/python mcp_server.py`

## References

- Full docs: [`MCP_README.md`](MCP_README.md)
- Agent guidelines: [`AGENTS.md`](AGENTS.md)
- Project runbook: [`new_agents_runbookd.md`](new_agents_runbookd.md)
