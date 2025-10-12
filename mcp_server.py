#!/usr/bin/env python3
"""Root shim forwarding to server.mcp.server.MCPServer for backward compatibility."""
from server.mcp.server import MCPServer

if __name__ == "__main__":
    MCPServer().run()

