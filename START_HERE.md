# 🚀 RAG Service - START HERE

**👋 New here? You're in the right place!**

This is your complete multi-repo RAG service with MCP integration for AI agents. Everything is implemented, tested, and documented.

> **Note**: This system works with ANY multi-repo setup. The `scripts/` folder includes tools to auto-generate keywords and configurations for your specific projects.

---

## 🎯 Quick Start (Pick Your Goal)

### Option 1: "I want to run it RIGHT NOW"
1. Read: **[README.md](README.md)** → Jump to "Quick Start" section
2. Run `make dev` (or `bash scripts/dev_up.sh`) to start infra + MCP + API and open the GUI
3. Use the GUI → Misc tab to set Serve Host/Port and Auto‑start Colima → “Apply All Changes”
4. Index your repos from the GUI (Indexing tab) or via CLI

### Option 2: "I need to connect AI agents (Codex/Claude Code)"
1. Read: **[docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md)**
2. Copy config → Restart agent → Use tools

### Option 3: "I want the CLI chat interface"
1. Read: **[README.md](README.md)** → CLI Chat Interface
2. Run `python chat_cli.py` → Interactive chat with memory

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
├── 📘 README.md ....................... MAIN GUIDE (1105 lines)
│   └─ Everything: setup, .ragignore, MCP, CLI, eval, troubleshooting
│
├── 📋 AGENTS.md ....................... Agent behavior rules
├── 🧪 golden.json ..................... Test cases (replace with yours!)
│
└── 📂 docs/ ........................... Extended documentation
    │
    ├── 📄 README.md ................... Documentation index
    │
    ├── ⚡ QUICKSTART_MCP.md ........... Fast MCP setup (5 min)
    │   └─ Codex + Claude Code connection
    │
    ├── 🔧 MCP_README.md ............... MCP technical details
    │   └─ stdio/HTTP modes, web_get tool, troubleshooting
    │
    ├── 🌐 REMOTE_MCP.md ............... HTTP/HTTPS/tunneling setup
    │   └─ ngrok, Cloudflare, reverse proxy
    │
    ├── 💬 CLI_CHAT.md ................. Interactive CLI chat guide
    │   └─ Commands, features, examples
    │
    ├── 🤖 MODEL_RECOMMENDATIONS.md .... Current pricing & models
    │   ├─ Self-hosted (free, needs hardware)
    │   ├─ Cloud APIs (current Oct 2025 pricing)
    │   ├─ Benchmark links
    │   └─ Migration guides with code
    │
    └── 📊 GEN_MODEL_COMPARISON.md ..... Qwen vs OpenAI comparison
```

---

## 🗺️ Documentation by Task

| What You Want to Do | Which Doc to Read |
|---------------------|-------------------|
| **Set up from scratch** | [README.md](README.md) → Setup from Scratch |
| **Configure .ragignore** | [README.md](README.md) → Configure RAG Ignore |
| **Quick start (5 commands)** | [README.md](README.md) → Quick Start |
| **Interactive CLI chat** | [README.md](README.md) → CLI Chat Interface |
| **Connect Codex** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) |
| **Connect Claude Code** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) |
| **Remote MCP (HTTP/HTTPS)** | [docs/REMOTE_MCP.md](docs/REMOTE_MCP.md) |
| **Current model pricing** | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) |
| **Run 100% locally (no API)** | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) → Self-Hosted |
| **Auto-generate keywords** | [README.md](README.md) → Configure RAG Ignore → Auto-Generate |
| **Improve retrieval quality** | [README.md](README.md) → Troubleshooting → Retrieval Quality |
| **Add test questions** | [README.md](README.md) → Evaluation & Testing |
| **MCP tools not working** | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) → Troubleshooting |
| **Browse all docs** | [docs/README.md](docs/README.md) |

---

## ⚡ Super Quick Commands

```bash
# Bring infra + MCP up (always-on)
bash scripts/up.sh

# CLI chat (recommended for interactive use)
. .venv/bin/activate
export REPO=repo-a THREAD_ID=work-session
python chat_cli.py

# Index repos (replace with your repo names)
REPO=repo-a python index_repo.py && REPO=repo-b python index_repo.py

# Auto-generate keywords for your repos
cd scripts && python analyze_keywords.py /path/to/your/repo

# Eval to check quality
. .venv/bin/activate && python eval_loop.py

# MCP quick check (stdio mode)
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | python mcp_server.py | head -n1

# Use with Codex
codex
# Then type: "Use rag_answer to explain how authentication works in repo-a"
```

---

## ✅ What's Been Implemented

- ✅ **MCP Server (stdio + HTTP modes)**
  - `rag_answer(repo, question)` → Full pipeline with citations
  - `rag_search(repo, question)` → Retrieval-only (debugging)
  - `netlify_deploy(domain)` → Trigger deployments
  - `web_get(url)` → Fetch allowlisted docs

- ✅ **Interactive CLI Chat** (`chat_cli.py`)
  - Conversation memory (Redis-backed)
  - Rich terminal UI with markdown
  - Citation display
  - Repo switching mid-conversation

- ✅ **Eval Framework** (`eval_loop.py`, `golden.json`)
  - Baseline tracking
  - Regression detection per-question
  - Watch mode (auto re-run on changes)
  - JSON output for CI/CD

- ✅ **RAG Ignore System**
  - Built-in filtering (`filtering.py`)
  - Project-specific excludes (`data/exclude_globs.txt`)
  - Auto-keyword generation (`scripts/analyze_keywords.py`)

- ✅ **Complete Documentation** (2900+ lines)
  - Setup guides with .ragignore
  - MCP integration (stdio/HTTP/HTTPS)
  - CLI chat guide
  - Current model pricing (Oct 2025)
  - Troubleshooting

---

## 🎬 Recommended Path for New Users

1. **Get it running**
   - Follow: [README.md](README.md) → Quick Start (10 min)
   - Configure: [README.md](README.md) → Configure RAG Ignore (5 min)

2. **Try CLI chat** (recommended)
   - Run: `python chat_cli.py` with your repos

3. **Test quality**
   - Run: `python eval_loop.py` (2 min)
   - Add your own questions to `golden.json`

4. **Connect agents**
   - Follow: [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) (5 min)

5. **Optimize costs** (optional)
   - Read: [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md)
   - Switch to free/local models

---

## 🆘 Quick Help

| Problem | Solution |
|---------|----------|
| Setup not working | [README.md](README.md) → Troubleshooting |
| Files not being indexed | [README.md](README.md) → Configure RAG Ignore |
| MCP tools not appearing | [docs/QUICKSTART_MCP.md](docs/QUICKSTART_MCP.md) → Troubleshooting |
| Want current pricing | [docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md) |
| Low retrieval quality | [README.md](README.md) → Troubleshooting → Retrieval Quality |
| Need complete index | [docs/README.md](docs/README.md) |

---

**All Features**: Implemented & Tested  
**Last Updated**: October 8, 2025

**Need help?** All docs are cross-linked. Start anywhere and follow the links!
