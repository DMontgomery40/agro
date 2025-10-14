#!/bin/bash
# Wrapper script for building cards with proper Python path
set -e

cd "$(dirname "$0")"

# Activate virtual environment
. .venv/bin/activate

# Set Python path to current directory
export PYTHONPATH="$(pwd)"

# Set max cards if not already set (default to 10 for testing, 0 for all)
: "${CARDS_MAX:=10}"
export CARDS_MAX

# Run card builder
python indexer/build_cards.py "$@"

echo ""
echo "✓ Card building complete!"
echo ""
echo "Output files:"
echo "- Cards JSON: out.noindex-shared/agro/cards.jsonl"
echo "- Cards text: out.noindex-shared/agro/cards.txt"
echo "- BM25 index: out.noindex-shared/agro/bm25_cards/"
