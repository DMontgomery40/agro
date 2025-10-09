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
from config_loader import list_repos, get_default_repo
import urllib.request, urllib.error, urllib.parse
import json as _json


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
            repo_name = repo if repo in list_repos() else get_default_repo()
            cfg = {"configurable": {"thread_id": f"mcp-{repo_name or 'default'}"}}
            state = {
                "question": question,
                "documents": [],
                "generation": "",
                "iteration": 0,
                "confidence": 0.0,
                "repo": repo_name
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
                "repo": result.get("repo", repo_name or "unknown"),
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
            repo_name = repo if repo in list_repos() else get_default_repo()
            docs = search_routed_multi(
                question,
                repo_override=repo_name,
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
                    "repo": d.get("repo", repo_name or "unknown")
                }
                for d in docs
            ]

            return {
                "results": results,
                "repo": repo_name or (results[0]["repo"] if results else "unknown"),
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

    # --- Netlify helpers ---
    def _netlify_api(self, path: str, method: str = "GET", data: dict | None = None) -> dict:
        api_key = os.getenv("NETLIFY_API_KEY")
        if not api_key:
            raise RuntimeError("NETLIFY_API_KEY not set in environment")
        url = f"https://api.netlify.com/api/v1{path}"
        req = urllib.request.Request(url, method=method)
        req.add_header("Authorization", f"Bearer {api_key}")
        req.add_header("Content-Type", "application/json")
        body = None
        if data is not None:
            body = _json.dumps(data).encode("utf-8")
        try:
            with urllib.request.urlopen(req, data=body, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return _json.loads(raw) if raw else {}
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Netlify HTTP {he.code}: {err_body}")

    def _netlify_find_site_by_domain(self, domain: str) -> dict | None:
        sites = self._netlify_api("/sites", method="GET")
        if isinstance(sites, list):
            domain_low = (domain or "").strip().lower()
            for s in sites:
                for key in ("custom_domain", "url", "ssl_url"):
                    val = (s.get(key) or "").lower()
                    if val and domain_low in val:
                        return s
        return None

    def handle_netlify_deploy(self, domain: str) -> Dict[str, Any]:
        targets: list[str]
        if domain == "both":
            env_targets = os.getenv("NETLIFY_DOMAINS", "").strip()
            targets = [d.strip() for d in env_targets.split(",") if d.strip()] or []
            if not targets:
                return {"error": "NETLIFY_DOMAINS not set for 'both' target"}
        else:
            targets = [domain]
        results = []
        for d in targets:
            site = self._netlify_find_site_by_domain(d)
            if not site:
                results.append({"domain": d, "status": "not_found"})
                continue
            site_id = site.get("id")
            if not site_id:
                results.append({"domain": d, "status": "no_site_id"})
                continue
            try:
                build = self._netlify_api(f"/sites/{site_id}/builds", method="POST", data={})
                results.append({
                    "domain": d,
                    "status": "triggered",
                    "site_id": site_id,
                    "build_id": build.get("id"),
                })
            except Exception as e:
                results.append({"domain": d, "status": "error", "error": str(e)})
        return {"results": results}

    # --- Web tools (allowlisted) ---
    _WEB_ALLOWED = {"openai.com", "platform.openai.com", "github.com", "openai.github.io"}

    def _is_allowed_url(self, url: str) -> bool:
        try:
            u = urllib.parse.urlparse(url)
            host = (u.netloc or "").lower()
            # allow subdomains of allowed hosts
            return any(host == h or host.endswith("." + h) for h in self._WEB_ALLOWED)
        except Exception:
            return False

    def handle_web_get(self, url: str, max_bytes: int = 20000) -> Dict[str, Any]:
        if not (url or "").startswith("http"):
            return {"error": "url must start with http(s)"}
        if not self._is_allowed_url(url):
            return {"error": "host not allowlisted"}
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "rag-service-mcp/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read(max_bytes + 1)
                clipped = raw[:max_bytes]
                return {
                    "url": url,
                    "status": resp.status,
                    "length": len(raw),
                    "clipped": len(raw) > len(clipped),
                    "content_preview": clipped.decode("utf-8", errors="ignore")
                }
        except urllib.error.HTTPError as he:
            body = he.read().decode("utf-8", errors="ignore")
            return {"url": url, "status": he.code, "error": body[:1000]}
        except Exception as e:
            return {"url": url, "error": str(e)}

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
              "repo": "<repo name>",
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
            # Build dynamic enum from configured repos
            repo_enum = list_repos()
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": [
                        {
                            "name": "rag_answer",
                            "description": "Get RAG answer with citations for a question in a configured repo",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "repo": {
                                        "type": "string",
                                        "description": "Repository name (from repos.json)",
                                        "enum": repo_enum
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
                                        "description": "Repository name (from repos.json)",
                                        "enum": repo_enum
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
                        },
                        {
                            "name": "netlify_deploy",
                            "description": "Trigger a Netlify build for a domain or 'both' (uses NETLIFY_API_KEY; set NETLIFY_DOMAINS for 'both')",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "domain": {
                                        "type": "string",
                                        "description": "Target domain (or 'both' to deploy multiple from NETLIFY_DOMAINS)",
                                        "default": "both"
                                    }
                                }
                            }
                        },
                        {
                            "name": "web_get",
                            "description": "HTTP GET (allowlisted hosts only: openai.com, platform.openai.com, github.com, openai.github.io)",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "url": {"type": "string", "description": "Absolute URL to fetch"},
                                    "max_bytes": {"type": "integer", "description": "Max bytes to return", "default": 20000}
                                },
                                "required": ["url"]
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

            elif tool_name in ("netlify.deploy", "netlify_deploy"):
                domain = args.get("domain", "both")
                result = self.handle_netlify_deploy(domain)
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
                }

            elif tool_name in ("web.get", "web_get"):
                url = args.get("url", "")
                max_bytes = args.get("max_bytes", 20000)
                result = self.handle_web_get(url, max_bytes=max_bytes)
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
                        "name": "rag-service-mcp",
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
