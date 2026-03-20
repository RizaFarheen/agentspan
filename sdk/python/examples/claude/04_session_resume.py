# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Session Resume — demonstrate durable sessions across multiple workflow runs.

Demonstrates:
    - Tier 1 session durability: session state persisted on Agentspan server
    - Running the same agent twice; the second run resumes where the first left off
    - The workflow_id key for session storage (each unique workflow_id gets its own session)

How it works:
    - First run: agent explores the codebase and builds context
    - Second run (same workflow_id): agent resumes with full conversation history —
      it knows what it already read and can answer follow-up questions immediately

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated
    - claude-agent-sdk Python package installed
"""

from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import AgentRuntime

# Use the same agent definition for both runs
agent = ClaudeCodeAgent(
    name="session_demo_agent",
    allowed_tools=["Read", "Glob", "Grep"],
    cwd=".",
    max_turns=20,
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        # First run: explore
        print("=== Run 1: Initial exploration ===")
        result1 = runtime.run(agent, "Read the README and the main entry point of this project. Remember what you learned.")
        print(f"Status: {result1.status}")
        result1.print_result()

        # Second run with the SAME workflow: agent remembers what it read
        # (In practice, the workflow_id comes from Conductor and is stable across retries)
        print("\n=== Run 2: Follow-up question (same session) ===")
        result2 = runtime.run(agent, "Based on what you just read, what are the main dependencies of this project?")
        print(f"Status: {result2.status}")
        result2.print_result()
