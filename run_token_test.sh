#!/bin/bash
cd /Users/davidmontgomery/faxbot_folder/rag-service
. .venv/bin/activate
export PYTHONPATH=/Users/davidmontgomery/faxbot_folder/rag-service
export OLLAMA_URL=http://127.0.0.1:11434/api
export GEN_MODEL=qwen3-coder:30b
python scripts/test_token_comparison.py
