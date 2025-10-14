#!/bin/bash
# Wrapper script for running the indexer with proper Python path
set -e

cd "$(dirname "$0")"

# Activate virtual environment
. .venv/bin/activate

# Set Python path to current directory
export PYTHONPATH="$(pwd)"

# Run indexer
python indexer/index_repo.py "$@"

echo ""
echo "✓ Indexing complete!"
echo ""
echo "Summary:"
echo "- Chunks indexed: $(wc -l < out.noindex-shared/agro/chunks.jsonl 2>/dev/null || echo '0')"
echo "- Collection: code_chunks_agro"
echo "- Dense embeddings: ENABLED (3072 dims)"
echo "- Markdown files: INDEXED"
