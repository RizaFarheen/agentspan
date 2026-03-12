# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Integration tests for basic agent execution.

These tests require a running Conductor server with LLM support.
Skip with: pytest -m "not integration"

Requirements:
    - export AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - LLM provider "openai" configured in Conductor
"""

import pytest

from agentspan.agents import Agent, tool, run, start


pytestmark = pytest.mark.integration


@tool
def get_weather(city: str) -> dict:
    """Get current weather for a city."""
    return {"city": city, "temp": 72, "condition": "Sunny"}


class TestBasicExecution:
    """Test basic agent execution against a real Conductor server."""

    def test_simple_agent_run(self):
        agent = Agent(name="test_simple", model="openai/gpt-4o")
        result = run(agent, "Say hello in exactly 3 words.")
        assert result.output is not None
        assert result.workflow_id != ""
        assert result.status == "COMPLETED"

    def test_agent_with_tools(self):
        agent = Agent(
            name="test_tools",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="Use the get_weather tool to answer weather questions.",
        )
        result = run(agent, "What's the weather in NYC?")
        assert result.output is not None
        assert result.status == "COMPLETED"
        assert len(result.tool_calls) > 0

    def test_start_and_status(self):
        agent = Agent(name="test_start", model="openai/gpt-4o")
        handle = start(agent, "Count to 5.")
        assert handle.workflow_id != ""

        status = handle.get_status()
        assert status.workflow_id == handle.workflow_id
        assert status.status in ("RUNNING", "COMPLETED")


class TestMultiAgent:
    """Test multi-agent execution against a real Conductor server."""

    def test_sequential_pipeline(self):
        a = Agent(name="test_seq_a", model="openai/gpt-4o", instructions="Summarize in one sentence.")
        b = Agent(name="test_seq_b", model="openai/gpt-4o", instructions="Translate to French.")
        pipeline = a >> b
        result = run(pipeline, "Python is a popular programming language.")
        assert result.output is not None
        assert result.status == "COMPLETED"

    def test_handoff(self):
        sub = Agent(
            name="test_sub",
            model="openai/gpt-4o",
            instructions="You are a math expert.",
        )
        parent = Agent(
            name="test_handoff",
            model="openai/gpt-4o",
            instructions="Delegate math questions to the math expert.",
            agents=[sub],
            strategy="handoff",
        )
        result = run(parent, "What is 2+2?")
        assert result.output is not None
