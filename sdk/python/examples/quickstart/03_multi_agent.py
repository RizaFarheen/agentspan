#!/usr/bin/env python3
"""Multi-agent — sequential pipeline with two agents."""

from agentspan.agents import Agent, AgentRuntime

researcher = Agent(
    name="researcher",
    model="openai/gpt-4o-mini",
    instructions="Research the topic. Provide 3 key facts.",
)

writer = Agent(
    name="writer",
    model="openai/gpt-4o-mini",
    instructions="Write a brief summary based on the research provided.",
)

pipeline = researcher >> writer

with AgentRuntime() as rt:
    result = rt.run(pipeline, "Quantum computing")
    print(result.output)
