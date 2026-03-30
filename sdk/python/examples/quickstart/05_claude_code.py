#!/usr/bin/env python3
"""Claude Code agent — uses Claude's built-in tools (Read, Glob, Grep)."""

from agentspan.agents import Agent, AgentRuntime

agent = Agent(
    name="code_explorer",
    model="claude-code/sonnet",
    instructions="You explore codebases and answer questions about them.",
    tools=["Read", "Glob", "Grep"],
    max_turns=5,
)

with AgentRuntime() as rt:
    result = rt.run(agent, "What Python files are in the current directory?")
    print(result.output)
