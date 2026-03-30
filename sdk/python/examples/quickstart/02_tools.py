#!/usr/bin/env python3
"""Agent with tools — define a tool function, agent calls it."""

from agentspan.agents import Agent, AgentRuntime, tool


@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"72°F and sunny in {city}"


agent = Agent(
    name="weather_bot",
    model="openai/gpt-4o-mini",
    instructions="Use the get_weather tool to answer weather questions.",
    tools=[get_weather],
)

with AgentRuntime() as rt:
    result = rt.run(agent, "What's the weather in Tokyo?")
    print(result.output)
