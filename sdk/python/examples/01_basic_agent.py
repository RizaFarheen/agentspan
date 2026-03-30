# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Basic Agent — 5-line hello world.

Demonstrates the simplest possible agent: a single LLM with no tools.

Requirements:
    - Conductor server with LLM support
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
    - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
"""

from agentspan.agents import Agent, AgentRuntime
from settings import settings

agent = Agent(name="greeter", model=settings.llm_model)


if __name__ == "__main__":
    with AgentRuntime() as runtime:
        # Deploy: push definition to server (idempotent).
        # CLI alternative: agentspan deploy examples.01_basic_agent
        runtime.deploy(agent)

        # Serve: start workers, poll for tasks (blocks until Ctrl+C).
        # Trigger from another terminal: agentspan run greeter "Say hello"
        runtime.serve(agent)

        # Quick test: uncomment below (and comment out serve) to run directly.
        # runtime.run() handles deploy + workers internally.
        # result = runtime.run(agent, "Say hello and tell me a fun fact about Python.")
        # result.print_result()
