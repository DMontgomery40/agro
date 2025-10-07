#!/usr/bin/env python3
"""
MCP server exposing RAG tools for Codex/Claude integration.
Implements Model Context Protocol via stdio.

Tools (sanitized names for OpenAI tool spec):
  - rag_answer(repo, question) → full LangGraph answer + citations
  - rag_search(repo, question) → retrieval-only (for debugging)
Compatibility: accepts legacy names "rag.answer" and "rag.search" on tools/call.
"""
import sys
import json
import os
from pathlib import Path
from typing import Dict, Any, List

# Ensure we can import from the same directory
sys.path.insert(0, str(Path(__file__).parent))

from langgraph_app import build_graph
from hybrid_search import search_routed_multi


class MCPServer:
    """Minimal MCP server over stdio."""

    def __init__(self):
        self.graph = None
        self._init_graph()

    def _init_graph(self):
        """Lazy-load the LangGraph."""
        try:
            self.graph = build_graph()
        except Exception as e:
            self._error(f"Failed to initialize graph: {e}")

    def _error(self, msg: str):
        """Write error to stderr (MCP uses stdout for protocol)."""
        print(f"ERROR: {msg}", file=sys.stderr)

    def _log(self, msg: str):
        """Write log to stderr."""
        print(f"LOG: {msg}", file=sys.stderr)

    def handle_rag_answer(self, repo: str, question: str) -> Dict[str, Any]:
        """
        Execute full LangGraph pipeline: retrieval → generation → answer.
        Returns: {answer: str, citations: List[str], repo: str}
        """
        if not self.graph:
            self._init_graph()

        if not self.graph:
            return {
                "error": "Graph not initialized",
                "answer": "",
                "citations": [],
                "repo": repo or "unknown"
            }

        try:
            cfg = {"configurable": {"thread_id": f"mcp-{repo or 'default'}"}}
            state = {
                "question": question,
                "documents": [],
                "generation": "",
                "iteration": 0,
                "confidence": 0.0,
                "repo": repo
            }

            result = self.graph.invoke(state, cfg)

            # Extract citations from documents
            docs = result.get("documents", [])[:5]
            citations = [
                f"{d['file_path']}:{d['start_line']}-{d['end_line']}"
                for d in docs
            ]

            return {
                "answer": result.get("generation", ""),
                "citations": citations,
                "repo": result.get("repo", repo or "unknown"),
                "confidence": float(result.get("confidence", 0.0))
            }
        except Exception as e:
            self._error(f"rag.answer error: {e}")
            return {
                "error": str(e),
                "answer": "",
                "citations": [],
                "repo": repo or "unknown"
            }

    def handle_rag_search(self, repo: str, question: str, top_k: int = 10) -> Dict[str, Any]:
        """
        Retrieval-only path for debugging.
        Returns: {results: List[Dict], repo: str, count: int}
        """
        try:
            docs = search_routed_multi(
                question,
                repo_override=repo,
                m=4,
                final_k=top_k
            )

            # Return slim results (no code bodies for MCP transport)
            results = [
                {
                    "file_path": d.get("file_path", ""),
                    "start_line": d.get("start_line", 0),
                    "end_line": d.get("end_line", 0),
                    "language": d.get("language", ""),
                    "rerank_score": float(d.get("rerank_score", 0.0)),
                    "repo": d.get("repo", repo or "unknown")
                }
                for d in docs
            ]

            return {
                "results": results,
                "repo": repo or (results[0]["repo"] if results else "unknown"),
                "count": len(results)
            }
        except Exception as e:
            self._error(f"rag.search error: {e}")
            return {
                "error": str(e),
                "results": [],
                "repo": repo or "unknown",
                "count": 0
            }

    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle MCP tool call request.

        Request format:
        {
          "jsonrpc": "2.0",
          "id": <request_id>,
          "method": "tools/call",
          "params": {
            "name": "rag.answer" | "rag.search",
            "arguments": {
              "repo": "vivified" | "faxbot",
              "question": "...",
              "top_k": 10  # optional, search only
            }
          }
        }
        """
        method = request.get("method")
        req_id = request.get("id")

        if method == "tools/list":
            # Return available tools
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": [
                        {
                            "name": "rag_answer",
                            "description": "Get RAG answer with citations for a question in a specific repo (vivified|faxbot)",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "repo": {
                                        "type": "string",
                                        "description": "Repository name: 'vivified' or 'faxbot'",
                                        "enum": ["vivified", "faxbot"]
                                    },
                                    "question": {
                                        "type": "string",
                                        "description": "Developer question to answer from codebase"
                                    }
                                },
                                "required": ["repo", "question"]
                            }
                        },
                        {
                            "name": "rag_search",
                            "description": "Retrieval-only search (debugging) - returns relevant code locations without generation",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "repo": {
                                        "type": "string",
                                        "description": "Repository name: 'vivified' or 'faxbot'",
                                        "enum": ["vivified", "faxbot"]
                                    },
                                    "question": {
                                        "type": "string",
                                        "description": "Search query for code retrieval"
                                    },
                                    "top_k": {
                                        "type": "integer",
                                        "description": "Number of results to return (default: 10)",
                                        "default": 10
                                    }
                                },
                                "required": ["repo", "question"]
                            }
                        }
                    ]
                }
            }

        elif method == "tools/call":
            params = request.get("params", {})
            tool_name = params.get("name")
            args = params.get("arguments", {})

            # Backward-compat: accept legacy dotted names
            if tool_name in ("rag.answer", "rag_answer"):
                result = self.handle_rag_answer(
                    repo=args.get("repo"),
                    question=args.get("question", "")
                )
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
                }

            elif tool_name in ("rag.search", "rag_search"):
                result = self.handle_rag_search(
                    repo=args.get("repo"),
                    question=args.get("question", ""),
                    top_k=args.get("top_k", 10)
                )
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
                }

            else:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32601,
                        "message": f"Unknown tool: {tool_name}"
                    }
                }

        elif method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "faxbot-rag-mcp",
                        "version": "1.0.0"
                    }
                }
            }

        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }

    def run(self):
        """Main stdio loop."""
        self._log("MCP server starting (stdio mode)...")

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
                response = self.handle_request(request)
                print(json.dumps(response), flush=True)
            except json.JSONDecodeError as e:
                self._error(f"Invalid JSON: {e}")
                print(json.dumps({
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    }
                }), flush=True)
            except Exception as e:
                self._error(f"Unexpected error: {e}")
                print(json.dumps({
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32603,
                        "message": f"Internal error: {e}"
                    }
                }), flush=True)


if __name__ == "__main__":
    server = MCPServer()
    server.run()
