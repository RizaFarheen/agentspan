# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Conductor Subagents (Tier 2) — Claude's Agent tool spawns real Conductor SUB_WORKFLOWs.

Demonstrates:
    - conductor_subagents=True: intercepts Claude's native Agent tool
    - Each subagent runs as a real Conductor SUB_WORKFLOW (visible in the Conductor UI)
    - Subagent events (subagent_start / subagent_stop) streamed to Agentspan SSE
    - The parent agent gets results back via hook denial with embedded result

Use case: large codebases where you want each module analyzed by a separate, independently
observable Conductor workflow — not an in-process thread.

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated
    - claude-agent-sdk Python package installed
    - A "claude_agent_workflow" Conductor workflow definition registered
"""

import os
from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

PROJECT_DIR = os.environ.get("PROJECT_DIR", ".")

agent = ClaudeCodeAgent(
    name="multi_module_analyzer",
    cwd=PROJECT_DIR,
    allowed_tools=["Read", "Glob", "Grep", "Agent"],
    max_turns=20,
    conductor_subagents=True,  # Tier 2: Agent tool → Conductor SUB_WORKFLOW
    subagent_overrides={
        # Subagent workflows use these settings (override defaults)
        "allowed_tools": ["Read", "Glob", "Grep"],
        "max_turns": 15,
    },
    system_prompt=(
        "You are a senior engineer performing a comprehensive codebase audit. "
        "Use your Agent tool to spawn subagents for analyzing individual modules in parallel. "
        "Each subagent should focus on one module or package. "
        "Synthesize their findings into a final report."
    ),
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            agent,
            "Perform a comprehensive security audit of this codebase. "
            "Use subagents to analyze each major module independently, then summarize findings.",
        )
        print(f"Status: {result.status}")
        result.print_result()
