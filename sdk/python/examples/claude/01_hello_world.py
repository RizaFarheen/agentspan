# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Hello World — simplest Claude Code Agent with read-only tools.

Demonstrates:
    - Creating a ClaudeCodeAgent (Tier 1 passthrough)
    - Running it with AgentRuntime
    - Session durability: state is checkpointed to Agentspan server after each tool call

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated (`claude --version`)
    - claude-agent-sdk Python package installed
"""

from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

agent = ClaudeCodeAgent(
    name="hello_agent",
    allowed_tools=["Read", "Glob", "Grep"],
    cwd=".",
    max_turns=10,
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(agent, "List the Python files in the current directory and summarize what this project does.")
        print(f"Status: {result.status}")
        result.print_result()
