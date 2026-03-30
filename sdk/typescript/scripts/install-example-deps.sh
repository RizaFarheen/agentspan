#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in examples/vercel-ai examples/langgraph examples/langchain examples/openai examples/adk; do
  if [ -f "$dir/package.json" ]; then
    echo "Installing deps for $dir..."
    (cd "$dir" && npm install --legacy-peer-deps)
  fi
done
echo "Done."
