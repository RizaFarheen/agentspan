#!/usr/bin/env python3
"""Basic Claude Agent SDK agent running through agentspan.

Prerequisites:
    pip install claude-code-sdk  # or: uv add claude-code-sdk
    export ANTHROPIC_API_KEY=sk-...

Usage:
    # Start the agentspan server first, then:
    uv run python examples/claude_agent_sdk/01_basic_agent.py
"""

from claude_code_sdk import ClaudeCodeOptions

from agentspan.agents import AgentRuntime


def main():
    options = ClaudeCodeOptions(
        allowed_tools=["Read", "Glob", "Grep"],
        max_turns=5,
    )

    with AgentRuntime() as runtime:
        result = runtime.run(
            options,
            prompt="List the Python files in the current directory and summarize what each one does.",
        )
        print(f"\n--- Result ---\n{result.output}")
        print(f"\n--- Metadata ---")
        print(f"Workflow ID: {result.workflow_id}")
        print(f"Status: {result.status}")
        if result.token_usage:
            print(f"Token usage: {result.token_usage}")


if __name__ == "__main__":
    main()
