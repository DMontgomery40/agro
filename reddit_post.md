# I Built a Local RAG System to Stop Burning $100s in Tokens on My Large Codebase

## The Problem

I maintain two large codebases (a healthcare app called PROJECT and a fax integration service called PROJECT - ~150K+ lines combined). I was using Claude Code and Codex CLI heavily for development, but I kept hitting walls:

- **Token limit hell**: Claude would frequently hit context limits trying to read 5-10 full files just to answer simple questions like "where is OAuth validated?"
- **Burning money**: Every time I asked "how does feature X work?", Claude would grep through files and load 10-20K tokens of code. At $2.50/1M input tokens, this adds up fast
- **Wrong answers**: Without precise context, Claude would hallucinate or miss the actual implementation
- **Slow responses**: Waiting for Claude to read and process huge files every single time

I did the math: asking 100 code questions per session was costing me ~$1.70 in wasted tokens, and I was getting mediocre results.

## The Solution: Local RAG with MCP Integration

After months of frustration, I finally bit the bullet and built a proper RAG (Retrieval-Augmented Generation) system specifically for my codebases. The key insight: **don't send Claude the code, send Claude WHERE the code is**.

### What I Built

**Hybrid search RAG** with:
- **BM25 sparse retrieval** (keyword matching)
- **Dense vector embeddings** (OpenAI text-embedding-3-large)
- **Cross-encoder reranking** (BAAI/bge-reranker-v2-m3)
- **MCP tools** so Claude Code can call it directly
- **Strict repo isolation** (PROJECT and PROJECT never mix)

### My Hardware: M4 Mac Mini

- **Model**: M4 Mac Mini (base model, 16GB RAM)
- **Why it works**: Apple Silicon is perfect for local ML inference
  - BM25 runs instantly in memory
  - Reranker runs on MPS (Metal Performance Shaders) - blazing fast
  - Qdrant + Redis run in Docker without breaking a sweat

Total resource usage during queries: ~4GB RAM, negligible CPU. This thing barely notices it's running.

## Setup Process (Easier Than You Think)

I followed the runbook in my `CLAUDE.md` (internal docs). Here's the TL;DR:

### 1. Infrastructure (5 minutes)

```bash
# Start Qdrant (vector DB) and Redis (chat memory)
cd infra
docker compose up -d

# Verify
curl http://127.0.0.1:6333/collections  # Qdrant
docker exec redis redis-cli ping        # Redis
```

**Cost: $0** (self-hosted, open source)

### 2. Python Environment (2 minutes)

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-rag.txt
```

Dependencies: LangGraph, Qdrant client, BM25S, sentence-transformers, FastAPI

### 3. Index Your Code (10 minutes)

```bash
export OPENAI_API_KEY=sk-proj-...
REPO=project python index_repo.py
REPO=project python index_repo.py
```

This:
- Chunks code using AST-aware splitting (functions, classes)
- Builds BM25 index (~50MB per repo)
- Generates embeddings (OpenAI text-embedding-3-large: $0.13/1M tokens)
- Stores vectors in Qdrant

**One-time indexing cost for my 150K lines**: ~$2.50

### 4. Connect to Claude Code via MCP (2 minutes)

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rag-service": {
      "command": "/path/to/.venv/bin/python",
      "args": ["/path/to/mcp_server.py"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-...",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "REDIS_URL": "redis://127.0.0.1:6379/0"
      }
    }
  }
}
```

Restart Claude Code. Done.

## What I Tried (The Good, Bad, and Ugly)

### ❌ What Didn't Work

1. **Pure semantic search**: Missed exact matches (e.g., searching "OAuth" wouldn't find `validate_token`)
2. **Pure keyword search**: Couldn't handle synonyms or related concepts
3. **Feeding full chunks to Claude**: Used MORE tokens than no RAG (see below)
4. **Pinecone/Weaviate cloud**: $70+/month for my vector count, plus latency

### ✅ What Works

**Hybrid search + MCP tools**

The magic is in the MCP integration. Instead of sending Claude the full code:

```json
// What Claude receives (824 tokens)
{
  "results": [
    {
      "file_path": "api/app/auth.py",
      "start_line": 123,
      "end_line": 145,
      "rerank_score": 0.89
    },
    // ... 9 more results
  ]
}
```

Claude gets:
- File paths
- Line ranges
- Relevance scores
- **NOT the actual code**

Then Claude can ask me to read specific files if needed, or just answer based on the locations.

## The Numbers (Measured, Not Estimated)

I built a test script to measure actual token usage. Here's what I found:

### Test Query: "How are fax jobs created and dispatched?"

| Approach | Tokens | Cost/Query | Savings |
|----------|--------|------------|---------|
| **Claude Alone** (no RAG) | 15,735 | $0.039 | baseline |
| **RAG Direct** (full chunks) | 6,077 | $0.015 | 61.4% |
| **RAG via MCP** | 1,239 | $0.003 | **92.1%** |

**MCP breakdown**: 441 tokens (tool schemas) + 798 tokens (response)

### Real-World Usage

For 100 questions in a coding session:

| Method | Total Tokens | Cost @ gpt-4o |
|--------|--------------|---------------|
| Claude Alone | ~1.5M | $3.75 |
| RAG MCP | ~124K | $0.31 |
| **YOU SAVE** | 1.38M | **$3.44** |

That's **$103/month** saved if you're a heavy user like me.

## Ongoing Costs (As of Oct 8, 2025)

### Per Query Breakdown

**OpenAI API costs:**
- Embedding query: ~20 tokens × $0.00000013 = $0.0000026
- Generation (if using rag_answer): ~150 output tokens × $0.00001 = $0.0015
- **Total per query: ~$0.003** (vs $0.039 without RAG)

### Monthly (100 queries/day)

- API calls: ~$9/month
- Infrastructure: $0 (self-hosted)
- **Total: $9/month vs $117/month without RAG**

### One-Time Costs

- Initial indexing: ~$2.50 per repo
- Re-indexing after major changes: ~$0.50/month

## Performance

- **Query speed**: 200-800ms for hybrid search + rerank
- **Accuracy**: 85-90% top-5 hit rate (measured with eval suite)
- **False positives**: Rare, because reranker is good
- **Context window**: Never hit limits anymore

## The Runbook (CLAUDE.md)

I documented everything in my repo's `CLAUDE.md` so AI agents know how to use it:

```markdown
**MANDATORY: Use RAG (rag_search) first**

- Always call `rag_search` to locate files and exact line ranges before proposing changes
- Route every query to the correct repo: `project` or `project`
- After retrieval, you may call `rag_answer` for a synthesized answer with citations
```

This forces Claude to ALWAYS check RAG before hallucinating or assuming I'm wrong about where code lives.

## Lessons Learned

1. **MCP is a game-changer**: Sending metadata instead of code is 20x more efficient
2. **Hybrid search > pure semantic**: You need both keyword and vector matching
3. **Reranking matters**: Cross-encoder takes you from 70% to 90% accuracy
4. **Local is viable**: M4 Mac Mini handles this easily, no GPU needed
5. **Strict repo boundaries**: Never mix codebases, ever

## Should You Build This?

**Build it if:**
- Your codebase is >50K lines
- You're spending >$20/month on Claude API
- You use Claude Code or Codex CLI heavily
- You have an M1+ Mac or any machine with 16GB+ RAM

**Don't build it if:**
- Your codebase is small (<10K lines) - Claude can read it all
- You rarely ask code questions
- You don't mind the cost
- You can't run Docker

## Next Steps for Me

1. ✅ Add more golden test cases to eval suite
2. ✅ Tune confidence thresholds to reduce false positives
3. ⏳ Experiment with local embeddings (voyage-3-lite or mxbai) to cut costs further
4. ⏳ Add code cards (1-3 line summaries) for better retrieval on "where is X done?" queries

## Code & Docs

I can't open-source the whole thing (proprietary codebases), but the architecture is:
- **Indexing**: `index_repo.py` (AST chunking + embeddings)
- **Search**: `hybrid_search.py` (BM25 + Qdrant + rerank)
- **MCP Server**: `mcp_server.py` (stdio-based tool server)
- **Orchestration**: `langgraph_app.py` (iterative retrieval with confidence gating)

Full docs in my `README.md` (1,305 lines), `CLAUDE.md` runbook, and `START_HERE.md` nav guide.

## Questions?

Happy to answer questions about the setup, costs, or architecture. This has been a game-changer for my workflow.

---

**Tech Stack:**
- Python 3.11
- LangGraph (orchestration)
- Qdrant (vector DB, self-hosted)
- Redis (LangGraph checkpoints)
- BM25S (sparse retrieval)
- OpenAI text-embedding-3-large (embeddings)
- BAAI/bge-reranker-v2-m3 (reranking)
- FastAPI (optional HTTP server)
- MCP (Model Context Protocol)

**Hardware:**
- M4 Mac Mini (16GB RAM)
- Docker for infra

**Monthly Cost:**
- API: ~$9
- Infrastructure: $0 (self-hosted)
- **Total: $9/month** (was $117/month)

**ROI: Paid for itself in week 1** 🚀
