#!/usr/bin/env python3
"""Basic agent — the simplest possible agentspan example."""

from agentspan.agents import Agent, AgentRuntime

agent = Agent(
    name="greeter",
    model="openai/gpt-4o-mini",
    instructions="You are a friendly assistant. Keep responses brief.",
)

with AgentRuntime() as rt:
    result = rt.run(agent, "Hello! What can you do?")
    print(result.output)
