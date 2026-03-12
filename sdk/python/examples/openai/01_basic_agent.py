# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Basic OpenAI Agent — simplest possible agent with no tools.

Demonstrates:
    - Defining an agent using the OpenAI Agents SDK
    - Running it on the Conductor agent runtime (auto-detected)
    - The runtime serializes the agent generically and the server
      normalizes the OpenAI-specific config into a Conductor workflow.

Requirements:
    - pip install openai-agents
    - Conductor server with OpenAI LLM integration configured
    - export AGENTSPAN_SERVER_URL=http://localhost:7001/api
"""

from agents import Agent

from agentspan.agents import AgentRuntime

agent = Agent(
    name="greeter",
    instructions="You are a friendly assistant. Keep your responses concise and helpful.",
    model="gpt-4o",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Say hello and tell me a fun fact about the Python programming language.")
    result.print_result()
