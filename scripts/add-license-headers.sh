#!/bin/bash
# Adds MIT license headers to all source files in the repo.
# Safe to run multiple times — skips files that already have the header.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

GO_HEADER="// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details."

PY_HEADER="# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details."

JAVA_HEADER="/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */"

JS_HEADER="// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details."

add_header() {
    local file="$1"
    local header="$2"
    local marker="$3"  # string to check if header already present

    if head -5 "$file" | grep -q "$marker"; then
        return 0  # already has header
    fi

    local tmp="$(mktemp)"

    # Handle shebang lines — header goes after the shebang
    if head -1 "$file" | grep -q "^#!"; then
        head -1 "$file" > "$tmp"
        echo "" >> "$tmp"
        echo "$header" >> "$tmp"
        echo "" >> "$tmp"
        tail -n +2 "$file" >> "$tmp"
    else
        echo "$header" >> "$tmp"
        echo "" >> "$tmp"
        cat "$file" >> "$tmp"
    fi

    mv "$tmp" "$file"
    echo "  + $file"
}

count=0

echo "Adding license headers to Go files..."
while IFS= read -r f; do
    add_header "$f" "$GO_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/cli" -name "*.go" -type f)

echo "Adding license headers to Python files..."
while IFS= read -r f; do
    add_header "$f" "$PY_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/sdk/python/src" -name "*.py" -type f)
while IFS= read -r f; do
    add_header "$f" "$PY_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/sdk/python/tests" -name "*.py" -type f 2>/dev/null)
while IFS= read -r f; do
    add_header "$f" "$PY_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/sdk/python/examples" -name "*.py" -type f 2>/dev/null)
while IFS= read -r f; do
    add_header "$f" "$PY_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/sdk/python/scripts" -name "*.py" -type f 2>/dev/null)

echo "Adding license headers to Java files..."
while IFS= read -r f; do
    add_header "$f" "$JAVA_HEADER" "Copyright (c) 2025 AgentSpan"
    count=$((count + 1))
done < <(find "$REPO_ROOT/server/src" -name "*.java" -type f)

echo "Adding license headers to JS files..."
for f in "$REPO_ROOT/cli/cli.js" "$REPO_ROOT/cli/install.js"; do
    if [ -f "$f" ]; then
        add_header "$f" "$JS_HEADER" "Copyright (c) 2025 AgentSpan"
        count=$((count + 1))
    fi
done

echo ""
echo "Done. Processed $count files."
