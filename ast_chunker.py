import os, re, hashlib
from typing import Dict, List, Optional
from tree_sitter_languages import get_parser

LANG_MAP = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".go": "go", ".java": "java", ".rs": "rust",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
}

FUNC_NODES = {
    "python": {"function_definition", "class_definition"},
    "javascript": {"function_declaration", "class_declaration", "method_definition", "arrow_function"},
    "typescript": {"function_declaration", "class_declaration", "method_signature", "method_definition", "arrow_function"},
    "go": {"function_declaration", "method_declaration"},
    "java": {"class_declaration", "method_declaration"},
    "rust": {"function_item", "impl_item"},
    "c": {"function_definition"},
    "cpp": {"function_definition", "class_specifier"},
}

IMPORT_NODES = {
    "python": {"import_statement", "import_from_statement"},
    "javascript": {"import_declaration"},
    "typescript": {"import_declaration"},
    "go": {"import_declaration"},
    "java": {"import_declaration"},
    "rust": {"use_declaration"},
    "c": set(), "cpp": set(),
}

def lang_from_path(path:str)->Optional[str]:
    _, ext = os.path.splitext(path)
    return LANG_MAP.get(ext.lower())

def nonws_len(s:str)->int:
    return len(re.sub(r"\s+", "", s))

def extract_imports(src:str, lang:str)->List[str]:
    try:
        parser = get_parser(lang)
        tree = parser.parse(bytes(src, "utf-8"))
        imports = []
        def walk(n):
            if n.type in IMPORT_NODES.get(lang, set()):
                imports.append(src[n.start_byte:n.end_byte])
            for c in n.children:
                walk(c)
        walk(tree.root_node)
        return imports
    except Exception:
        if lang == "python":
            return re.findall(r"^(?:from\s+[^\n]+|import\s+[^\n]+)$", src, flags=re.M)
        if lang in {"javascript","typescript"}:
            return re.findall(r"^import\s+[^\n]+;$", src, flags=re.M)
        return []

def greedy_fallback(src:str, fpath:str, lang:str, target:int)->List[Dict]:
    sep = r"(?:\nclass\s+|\ndef\s+)" if lang=="python" else r"(?:\nclass\s+|\nfunction\s+)"
    parts = re.split(sep, src)
    if len(parts) < 2:
        out, cur, acc = [], [], 0
        for line in src.splitlines(True):
            cur.append(line); acc += nonws_len(line)
            if acc >= target:
                out.append("".join(cur)); cur, acc = [], 0
        if cur: out.append("".join(cur))
        return [{
            "id": hashlib.md5((fpath+str(i)+s[:80]).encode()).hexdigest()[:12],
            "file_path": fpath, "language": lang, "type":"blob","name":None,
            "start_line": 1, "end_line": s.count("\n")+1, "imports": extract_imports(src, lang), "code": s
        } for i,s in enumerate(out)]
    else:
        rejoined, buf, acc = [], [], 0
        for p in parts:
            if acc + nonws_len(p) > target and buf:
                s = "".join(buf); rejoined.append(s); buf, acc = [], 0
            buf.append(p); acc += nonws_len(p)
        if buf: rejoined.append("".join(buf))
        return [{
            "id": hashlib.md5((fpath+str(i)+s[:80]).encode()).hexdigest()[:12],
            "file_path": fpath, "language": lang, "type":"section","name":None,
            "start_line": 1, "end_line": s.count("\n")+1, "imports": extract_imports(s, lang), "code": s
        } for i,s in enumerate(rejoined)]

def collect_files(roots:List[str])->List[str]:
    out=[]
    skip_dirs = {".git","node_modules",".venv","venv","dist","build","__pycache__",".next",".turbo",".parcel-cache",".pytest_cache"}
    for root in roots:
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if d not in skip_dirs and not d.startswith('.venv') and not d.startswith('venv')]
            for fn in fns:
                p = os.path.join(dp, fn)
                if lang_from_path(p):
                    out.append(p)
    return out

def _guess_name(lang:str, text:str)->Optional[str]:
    if lang=="python":
        m = re.search(r"^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", text, flags=re.M)
        return m.group(1) if m else None
    if lang in {"javascript","typescript"}:
        m = re.search(r"^(?:function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)", text, flags=re.M)
        return m.group(1) if m else None
    return None

def chunk_code(src:str, fpath:str, lang:str, target:int=900)->List[Dict]:
    """AST-aware chunking around functions/classes; falls back if no nodes."""
    try:
        parser = get_parser(lang)
        tree = parser.parse(bytes(src, "utf-8"))
        wanted = FUNC_NODES.get(lang, set())
        nodes = []
        stack = [tree.root_node]
        while stack:
            n = stack.pop()
            if n.type in wanted:
                nodes.append(n)
            stack.extend(n.children)
        if not nodes:
            return greedy_fallback(src, fpath, lang, target)
        chunks: List[Dict] = []
        for i, n in enumerate(nodes):
            text = src[n.start_byte:n.end_byte]
            if nonws_len(text) > target:
                for j, sub in enumerate(greedy_fallback(text, fpath, lang, target)):
                    sub["id"] = hashlib.md5((fpath+f"/{i}:{j}"+sub["code"][:80]).encode()).hexdigest()[:12]
                    sub["start_line"] = n.start_point[0]+1
                    sub["end_line"] = sub["start_line"] + sub["code"].count("\n")
                    chunks.append(sub)
            else:
                name = _guess_name(lang, text)
                chunks.append({
                    "id": hashlib.md5((fpath+str(i)+text[:80]).encode()).hexdigest()[:12],
                    "file_path": fpath,
                    "language": lang,
                    "type": "unit",
                    "name": name,
                    "start_line": n.start_point[0]+1,
                    "end_line": n.end_point[0]+1,
                    "imports": extract_imports(src, lang),
                    "code": text,
                })
        return chunks
    except Exception:
        return greedy_fallback(src, fpath, lang, target)
