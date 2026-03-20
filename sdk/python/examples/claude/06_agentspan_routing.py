# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Agentspan Routing (Tier 3) — all tool calls routed through Conductor SIMPLE tasks.

Demonstrates:
    - agentspan_routing=True: replaces the Claude CLI subprocess entirely
    - AgentspanTransport drives the Anthropic Messages API directly
    - Every tool call (Bash, Read, Write, etc.) dispatched as a Conductor SIMPLE task
    - Full observability: each tool execution is a visible Conductor task
    - Implies conductor_subagents=True

Use case: environments where you need every tool call to be auditable, retryable,
and visible in the Conductor UI — e.g., production CI/CD pipelines or regulated environments.

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - ANTHROPIC_API_KEY (Tier 3 calls the Anthropic Messages API directly)
    - claude-agent-sdk Python package installed
    - claude_builtin_* workers registered in Conductor
      (start them with: uv run python -m agentspan.agents.frameworks.claude_builtin_workers)
"""

import os
from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

PROJECT_DIR = os.environ.get("PROJECT_DIR", ".")

agent = ClaudeCodeAgent(
    name="fully_routed_agent",
    cwd=PROJECT_DIR,
    allowed_tools=["Read", "Glob", "Grep", "Bash"],
    max_turns=30,
    model="claude-opus-4-6",
    max_tokens=8192,
    agentspan_routing=True,  # Tier 3: all tools → Conductor SIMPLE tasks
    system_prompt="You are a software engineer. Analyze the project and run the test suite.",
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            agent,
            "Run the test suite and report which tests pass and which fail. "
            "If any tests fail, read the relevant source files and explain the likely cause.",
        )
        print(f"Status: {result.status}")
        result.print_result()
