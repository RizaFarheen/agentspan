# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Code Editor — agent that reads and modifies files.

Demonstrates:
    - Adding Write and Edit tools for file modification
    - Bash for running tests after changes
    - Tier 1 passthrough with full event observability

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated
    - claude-agent-sdk Python package installed
"""

import os
from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

PROJECT_DIR = os.environ.get("PROJECT_DIR", ".")

agent = ClaudeCodeAgent(
    name="code_editor",
    cwd=PROJECT_DIR,
    allowed_tools=["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    max_turns=50,
    system_prompt=(
        "You are an expert software engineer. When making changes: "
        "1) Read and understand the existing code first, "
        "2) Make minimal, focused changes, "
        "3) Run tests after changes to verify correctness, "
        "4) Explain what you changed and why."
    ),
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            agent,
            "Find any TODO comments in the Python source files and implement them. Run the tests when done.",
        )
        print(f"Status: {result.status}")
        result.print_result()
