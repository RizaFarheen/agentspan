# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Basic Google ADK Agent — simplest possible agent.

Demonstrates:
    - Defining an agent using Google's Agent Development Kit (ADK)
    - Running it on the Conductor agent runtime (auto-detected)
    - The runtime serializes the agent generically and the server
      normalizes the ADK-specific config into a Conductor workflow.

Requirements:
    - pip install google-adk
    - Conductor server with Google Gemini LLM integration configured
    - export CONDUCTOR_SERVER_URL=http://localhost:7001/api
"""

from google.adk.agents import Agent

from agentspan.agents import AgentRuntime

agent = Agent(
    name="greeter",
    model="gemini-2.0-flash",
    instruction="You are a friendly assistant. Keep your responses concise and helpful.",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Say hello and tell me a fun fact about machine learning.")
    result.print_result()
