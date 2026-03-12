# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Basic Agent — 5-line hello world.

Demonstrates the simplest possible agent: a single LLM with no tools.

Requirements:
    - Conductor server with LLM support
    - LLM provider "openai" configured
    - export AGENTSPAN_SERVER_URL=http://localhost:7001/api
"""

from agentspan.agents import Agent, AgentRuntime
from model_config import get_model

agent = Agent(name="greeter", model=get_model())

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Say hello and tell me a fun fact about Python programming.")
    print(f'agent completed with status: {result.status}')
    result.print_result()
