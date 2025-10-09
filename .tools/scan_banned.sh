#!/usr/bin/env bash
set -euo pipefail
# ignore common build outputs and internal tools
OUT=$(git ls-files -z \
  | grep -z -v -E '(^\\.git|\\.venv/|node_modules/|dist/|build/|\\.next/|\\.tools/|data/redis/)' \
  | xargs -0 -r grep -nH -F -f .tools/banned_terms.txt || true)
if [ -n "$OUT" ]; then
  printf "%s\n" "$OUT"
  exit 1
else
  exit 0
fi
