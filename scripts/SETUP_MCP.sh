#!/bin/bash
# Quick MCP setup script for Codex and Claude Code

set -e

# Auto-detect repo root (script dir parent)
RAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="${RAG_ROOT}/.venv/bin/python"
MCP_SERVER="${RAG_ROOT}/mcp_server.py"

echo "🚀 Setting up MCP server for RAG service"
echo ""

# Check files exist
if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌ Error: Python venv not found at $VENV_PYTHON"
    echo "   Run: cd $RAG_ROOT && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

if [ ! -f "$MCP_SERVER" ]; then
    echo "❌ Error: MCP server not found at $MCP_SERVER"
    exit 1
fi

echo "✅ Files verified"
echo ""

# Setup for Codex
echo "📦 Setting up for Codex CLI..."
if command -v codex &> /dev/null; then
    echo "   Codex found: $(which codex)"

    # Check if already registered
    # Use a generic, stable server name
    SERVER_NAME="rag-service"
    if codex mcp list 2>/dev/null | grep -q "$SERVER_NAME"; then
        echo "   ⚠️  $SERVER_NAME already registered"
        read -p "   Remove and re-register? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            codex mcp remove "$SERVER_NAME" || true
            codex mcp add "$SERVER_NAME" -- "$VENV_PYTHON" "$MCP_SERVER"
            echo "   ✅ Re-registered with Codex"
        fi
    else
        codex mcp add "$SERVER_NAME" -- "$VENV_PYTHON" "$MCP_SERVER"
        echo "   ✅ Registered with Codex"
    fi

    echo ""
    echo "   To use in Codex:"
    echo "   $ codex"
    echo "   > Use rag_search to find OAuth code in your repo"
else
    echo "   ⚠️  Codex CLI not found. Install with:"
    echo "      brew install codex"
    echo "      or: npm install -g @openai/codex"
fi

echo ""
echo "📦 Setting up for Claude Code..."

# Setup for Claude Code
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
    echo "   ⚠️  Claude Code config directory not found"
    echo "      Expected: $CLAUDE_CONFIG_DIR"
    echo "      Install Claude Code: https://claude.ai/download"
else
    echo "   Config location: $CLAUDE_CONFIG"

    # Check if config exists
    if [ -f "$CLAUDE_CONFIG" ]; then
        echo "   ⚠️  Config file already exists"
        echo ""
        echo "   Add this to your config manually:"
    else
        echo "   Creating new config file..."
    fi

    # Show the config to add
    cat <<EOF

{
  "mcpServers": {
    "rag-service": {
      "command": "$VENV_PYTHON",
      "args": ["$MCP_SERVER"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}

EOF

    if [ ! -f "$CLAUDE_CONFIG" ]; then
        read -p "   Create this config now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mkdir -p "$CLAUDE_CONFIG_DIR"
            cat > "$CLAUDE_CONFIG" <<EOF
{
  "mcpServers": {
    "rag-service": {
      "command": "$VENV_PYTHON",
      "args": ["$MCP_SERVER"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
EOF
            echo "   ✅ Config created!"
            echo "   ⚠️  IMPORTANT: Edit $CLAUDE_CONFIG"
            echo "      and replace 'your-api-key-here' with your actual OpenAI API key"
        fi
    else
        echo "   Manual steps:"
        echo "   1. Open: $CLAUDE_CONFIG"
        echo "   2. Add the 'rag-service' entry shown above"
        echo "   3. Replace 'your-api-key-here' with your OpenAI API key"
        echo "   4. Restart Claude Code"
    fi
fi

echo ""
echo "🧪 Testing MCP server..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | "$VENV_PYTHON" "$MCP_SERVER" 2>&1 | head -20

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  • Codex: Run 'codex' and try: Use rag_search to find OAuth in your repo"
echo "  • Claude Code: Restart app, then use rag_answer or rag_search tools"
echo ""
echo "Docs:"
echo "  • Quick start: docs/QUICKSTART_MCP.md"
echo "  • Full guide: README.md"
