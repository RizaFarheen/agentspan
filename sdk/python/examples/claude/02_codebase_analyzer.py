# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Codebase Analyzer — read-only agent that explores a project directory.

Demonstrates:
    - Pointing ClaudeCodeAgent at a specific cwd
    - Read-only tool set (Read, Glob, Grep) — safe for any codebase
    - Tier 1: full SSE event observability via tool_call / tool_result events

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated
    - claude-agent-sdk Python package installed
"""

import os
from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

# Point at any directory you want to analyze
PROJECT_DIR = os.environ.get("PROJECT_DIR", ".")

agent = ClaudeCodeAgent(
    name="codebase_analyzer",
    cwd=PROJECT_DIR,
    allowed_tools=["Read", "Glob", "Grep"],
    max_turns=30,
    system_prompt=(
        "You are an expert code reviewer. When analyzing a codebase, always start by "
        "listing the top-level structure, then look at key entry points and configuration files. "
        "Provide a concise summary: purpose, tech stack, notable patterns, and potential improvements."
    ),
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            agent,
            f"Analyze the codebase at {PROJECT_DIR}. Summarize: purpose, tech stack, architecture, and any areas for improvement.",
        )
        print(f"Status: {result.status}")
        result.print_result()
