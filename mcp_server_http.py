#!/usr/bin/env python3
"""Root shim forwarding to server.mcp.http for backward compatibility."""
from server.mcp.http import mcp  # re-export tools
import os

if __name__ == "__main__":
    host = os.getenv("MCP_HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_HTTP_PORT", "8013"))
    path = os.getenv("MCP_HTTP_PATH", "/mcp")
    mcp.run(transport="http", host=host, port=port, path=path)
