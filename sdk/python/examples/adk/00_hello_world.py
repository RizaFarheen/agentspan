# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Minimal Google ADK greeting agent — for debugging the native runner.

The simplest possible ADK agent: no tools, no structured output, one turn.
Used to verify the ADK native shim works end-to-end before testing more
complex examples.

Requirements:
    - pip install google-adk
    - GOOGLE_API_KEY or GEMINI_API_KEY environment variable
    - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash (for AgentSpan runs)
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api (for AgentSpan runs)
"""

from google.adk.agents import Agent

from agentspan.agents import AgentRuntime

from settings import settings

agent = Agent(
    name="greeter",
    model=settings.llm_model,
    instruction="You are a friendly greeter. Reply with a warm hello and one fun fact.",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Say hello!")
    result.print_result()
