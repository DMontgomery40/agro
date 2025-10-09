# 🚀 RAG Service - START HERE

**👋 New here? You're in the right place!**

This is your complete RAG service with MCP integration for AI agents. Everything is implemented, tested, and documented.

---

## 🎯 Quick Start (Pick Your Goal)

### Option 1: "I want to run it RIGHT NOW"
1. Read: **[README.md](README.md)** → Jump to "Quick Start" section
2. Run `bash scripts/up.sh` (infra + MCP), then index both repos → You're up

### Option 2: "I need to connect AI agents (Codex/Claude Code)"
1. Read: **[docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md)**
2. Copy config → Restart agent → Use tools

### Option 3: "Show me what this does first"
1. Read: **[docs/IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md)**
2. See features, architecture, test results

### Option 4: "I want to save money / run locally"
1. Read: **[docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md)**
2. Pick free cloud or local models → Follow migration guide

---

## 📚 Complete Documentation Map

```
rag-service/
│
├── 📄 START_HERE.md ................... This file (navigation hub)
│
├── 📘 README.md ....................... MAIN GUIDE (1305 lines)
│   └─ Everything: setup, MCP, eval, troubleshooting, config
│
├── 📋 AGENTS.md ....................... Agent behavior rules
├── 🧪 golden.json ..................... Test cases (add yours!)
│
└── 📂 docs/ ........................... Extended documentation
    │
    ├── 📄 README.md ................... Documentation index
    │
    ├── ⚡ QUICKSTART_MCP.md ........... Fast MCP setup (5 min)
    │   └─ Codex + Claude Code connection
    │
    ├── 🔧 MCP_README.md ............... MCP technical details
    │   └─ Protocol specs, troubleshooting
    │
    ├── 🤖 MODEL_RECOMMENDATIONS.md .... Model Guide (585 lines)
    │   ├─ 20+ embedding models
    │   ├─ 15+ inference models
    │   ├─ Free options (Google Gemini)
    │   ├─ Local options (Ollama)
    │   └─ Migration guides with code
    │
    ├── ✅ IMPLEMENTATION_COMPLETE.md .. What was built
    │   └─ Features, files, tests, comparisons
    │
    └── 📝 SUMMARY.md .................. Quick overview
```

---

## 🗺️ Documentation by Task

| What You Want to Do | Which Doc to Read |
|---------------------|-------------------|
| **Set up from scratch** | [README.md](README.md) → Setup from Scratch |
| **Quick start (5 commands)** | [README.md](README.md) → Quick Start |
| **Connect Codex** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) |
| **Connect Claude Code** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) |
| **Save money on API costs** | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) |
| **Run 100% locally (no API)** | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) → Local section |
| **Improve retrieval quality** | [README.md](README.md) → Troubleshooting → Retrieval Quality |
| **Add test questions** | [README.md](README.md) → Evaluation & Testing |
| **Understand what was built** | [docs/IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) |
| **MCP tools not working** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) → Troubleshooting |
| **Browse all docs** | [docs/README.md](docs/README.md) |

---

## ⚡ Super Quick Commands

```bash
# Bring infra + MCP up (always-on)
bash scripts/up.sh

# Eval to check quality
. .venv/bin/activate && python eval_loop.py

# MCP quick check (stdio)
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | python mcp_server.py | head -n1

# Use with Codex
codex
# Then type: "Use rag.answer to explain how OAuth works in vivified"

# Index repos
REPO=vivified python index_repo.py && REPO=faxbot python index_repo.py
```

---

## ✅ What's Been Implemented

- ✅ **MCP Server** (`mcp_server.py`) - AI agents call your RAG via tools
  - `rag.answer(repo, question)` → Full pipeline with citations
  - `rag.search(repo, question)` → Retrieval-only (debugging)

- ✅ **Eval Framework** (`eval_loop.py`, `golden.json`)
  - Baseline tracking
  - Regression detection
  - Watch mode (auto re-run on changes)

- ✅ **Complete Documentation** (2804 lines)
  - Setup guides
  - MCP integration (Codex + Claude Code)
  - Model alternatives (free + local)
  - Troubleshooting
  - Advanced config

---

## 📊 Documentation Stats

| Document | Lines | What It Covers |
|----------|-------|----------------|
| [README.md](README.md) | 1305 | Complete setup & usage guide |
| [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) | 585 | 20+ models, benchmarks, migrations |
| [docs/IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) | 295 | What was delivered, tests |
| [docs/SUMMARY.md](docs/SUMMARY.md) | 227 | Quick overview |
| [docs/MCP_README.md](docs/MCP_README.md) | 206 | MCP technical reference |
| [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) | 124 | Fast MCP setup |
| [docs/README.md](docs/README.md) | 62 | Documentation index |
| **TOTAL** | **2804** | **Everything you need** |

---

## 🎬 Recommended Path for New Users

1. **Understand what you have**
   - Read: [docs/IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) (5 min)

2. **Get it running**
   - Follow: [README.md](README.md) → Quick Start (10 min)

3. **Test quality**
   - Run: `python eval_loop.py` (2 min)

4. **Connect agents**
   - Follow: [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) (5 min)

5. **Consider cost savings** (optional)
   - Read: [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md)
   - Pick free or local models

---

## 🆘 Quick Help

| Problem | Solution |
|---------|----------|
| Setup not working | [README.md](README.md) → Troubleshooting |
| MCP tools not appearing | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) → Troubleshooting |
| Want to switch models | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) |
| Low retrieval quality | [README.md](README.md) → Troubleshooting → Retrieval Quality |
| Need complete index | [docs/README.md](docs/README.md) |

---

**All Features**: Implemented & Tested

**Need help?** All docs are cross-linked. Start anywhere and follow the links!
