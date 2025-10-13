from server.langgraph_app import build_graph  # shim for backward compatibility

if __name__ == '__main__':
    import sys
    q = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else 'Where is OAuth token validated?'
    graph = build_graph(); cfg = {'configurable': {'thread_id': 'dev'}}
    res = graph.invoke({'question': q, 'documents': [], 'generation': '', 'iteration': 0, 'confidence': 0.0}, cfg)
    print(res['generation'])
