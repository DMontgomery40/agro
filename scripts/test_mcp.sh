#!/bin/bash
# Test MCP server functionality
set -e

cd "$(dirname "$0")/.."
. .venv/bin/activate

echo "==================================="
echo "MCP Server Tests"
echo "==================================="

echo ""
echo "1. Test initialize method..."
python -c "
import json
from mcp_server import MCPServer

req = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {}}
server = MCPServer()
resp = server.handle_request(req)
print(json.dumps(resp, indent=2))
assert resp['result']['protocolVersion'] == '2024-11-05'
print('✓ Initialize works')
"

echo ""
echo "2. Test tools/list method..."
python -c "
import json
from mcp_server import MCPServer

req = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}}
server = MCPServer()
resp = server.handle_request(req)
tools = resp['result']['tools']
assert len(tools) >= 2
names = [t['name'] for t in tools]
assert 'rag_answer' in names
assert 'rag_search' in names
print(f'✓ Found {len(tools)} tools: {names}')
"

echo ""
echo "3. Test rag.search (first configured repo)..."
python -c "
import json, sys
from mcp_server import MCPServer
 from config_loader import list_repos

 repos = list_repos()
 repo = repos[0] if repos else 'repo-a'
req = {
    'jsonrpc': '2.0',
    'id': 3,
    'method': 'tools/call',
    'params': {
        'name': 'rag_search',
        'arguments': {
            'repo': repo,
            'question': 'Where is OAuth token validated?',
            'top_k': 5
        }
    }
}

print(f'Calling rag_search for {repo}...', file=sys.stderr)
server = MCPServer()
resp = server.handle_request(req)

# Parse nested JSON response
content_text = resp['result']['content'][0]['text']
result = json.loads(content_text)

print(f'✓ Retrieved {result[\"count\"]} results for repo: {result[\"repo\"]}')
if result['count'] > 0:
    print(f'  Top result: {result[\"results\"][0][\"file_path\"]}')
"

echo ""
echo "4. Test rag.search (second configured repo, if any)..."
python -c "
import json, sys
from mcp_server import MCPServer
 from config_loader import list_repos

 repos = list_repos()
 repo = (repos[1] if len(repos) > 1 else (repos[0] if repos else 'repo-b'))
req = {
    'jsonrpc': '2.0',
    'id': 4,
    'method': 'tools/call',
    'params': {
        'name': 'rag_search',
        'arguments': {
            'repo': repo,
            'question': 'How do we handle inbound faxes?',
            'top_k': 5
        }
    }
}

print(f'Calling rag_search for {repo}...', file=sys.stderr)
server = MCPServer()
resp = server.handle_request(req)

content_text = resp['result']['content'][0]['text']
result = json.loads(content_text)

print(f'✓ Retrieved {result[\"count\"]} results for repo: {result[\"repo\"]}')
if result['count'] > 0:
    print(f'  Top result: {result[\"results\"][0][\"file_path\"]}')
"

echo ""
echo "==================================="
echo "✓ All MCP tests passed!"
echo "==================================="
echo ""
echo "Next steps:"
echo "  1. Codex should already have the server registered"
echo "  2. Try: codex mcp list"
echo "  3. In a Codex chat, try calling rag_answer or rag_search"
echo ""
