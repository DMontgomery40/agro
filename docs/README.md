# RAG Service Documentation

This folder contains comprehensive implementation guides and reference documentation.

## 📘 Documentation Files

### Core Guides
- **[MCP_README.md](MCP_README.md)** - Complete MCP server documentation
  - MCP protocol details (JSON-RPC 2.0)
  - Tool specifications and schemas
  - Integration with Codex and Claude Code
  - Troubleshooting MCP connections
  - Agent behavior rules

- **[QUICKSTART_MCP.md](QUICKSTART_MCP.md)** - Fast reference card
  - Essential commands
  - Quick setup instructions
  - Common usage examples
  - Architecture diagram

### Model Selection
- **[MODEL_RECOMMENDATIONS.md](MODEL_RECOMMENDATIONS.md)** - Model Guide (520+ lines)
  - **20+ embedding models** comparison (OpenAI, Google, Voyage, Ollama, BGE, NVIDIA)
  - **15+ inference models** for code generation (GPT-4o, Gemini, Claude, Qwen, DeepSeek)
  - Hardware-specific recommendations (Mac M1-M4, NVIDIA GPUs, CPU-only)
  - Migration guides (OpenAI → Local, OpenAI → Gemini)
  - Cost/performance analysis with MTEB scores and HumanEval benchmarks
  - ROI calculations and optimization strategies

### Implementation Details
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - What was delivered
  - Complete feature list
  - Files created (8 new, 3 modified)
  - Architecture diagrams
  - Smoke test results
  - Comparison with previous failed implementations

- **[SUMMARY.md](SUMMARY.md)** - Quick overview
  - Key features summary
  - Quick decision matrix

### Benchmarks & Ops
- **[GEN_MODEL_COMPARISON.md](GEN_MODEL_COMPARISON.md)** - Qwen 3 vs OpenAI generation comparison
- **[REMOTE_MCP.md](REMOTE_MCP.md)** - Expose the MCP server over HTTPS for remote agents/evals
  - Command reference

### Indexing Controls
- **RAG Ignore / Exclusions**
  - Built-in pruning and file gating: see `filtering.py`
  - Project-specific globs: edit `data/exclude_globs.txt`
  - Re-index after changes (`REPO=vivified python index_repo.py`)

## 🚀 Quick Navigation

**Just getting started?**  
→ Start with [../README.md](../README.md) (main setup guide). Use `bash scripts/up.sh` to keep infra + MCP always running.

**Defaults in this repo**
- Generation: Qwen 3 via Ollama (`GEN_MODEL`, `OLLAMA_URL`)
- Rerank: Cohere (`RERANK_BACKEND=cohere`, `COHERE_RERANK_MODEL=rerank-3.5`)

**Need to connect MCP to agents?**  
→ See [QUICKSTART_MCP.md](QUICKSTART_MCP.md)

**Want to save money or run locally?**  
→ See [MODEL_RECOMMENDATIONS.md](MODEL_RECOMMENDATIONS.md)

**Want technical MCP details?**  
→ See [MCP_README.md](MCP_README.md)

**Want to know what was implemented?**  
→ See [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)

---

**Note:** All documentation includes current model recommendations based on latest benchmarks.
