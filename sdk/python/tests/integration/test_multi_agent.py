# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Integration tests for multi-agent execution.

These tests require a running Conductor server with LLM support.
Skip with: pytest -m "not integration"

Requirements:
    - export AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - LLM provider "openai" configured in Conductor
"""

import pytest

from agentspan.agents import Agent, tool, run


pytestmark = pytest.mark.integration


class TestParallelExecution:
    """Test parallel agent strategy."""

    def test_parallel_agents(self):
        a1 = Agent(name="analyst_1", model="openai/gpt-4o", instructions="Analyze from a market perspective.")
        a2 = Agent(name="analyst_2", model="openai/gpt-4o", instructions="Analyze from a risk perspective.")

        analysis = Agent(
            name="parallel_test",
            model="openai/gpt-4o",
            agents=[a1, a2],
            strategy="parallel",
        )
        result = run(analysis, "Evaluate launching a new product.")
        assert result.output is not None
        assert result.status == "COMPLETED"


class TestRouterExecution:
    """Test router agent strategy."""

    def test_router_with_agent(self):
        planner = Agent(name="planner", model="openai/gpt-4o", instructions="Create a plan.")
        coder = Agent(name="coder", model="openai/gpt-4o", instructions="Write code.")

        router = Agent(
            name="lead",
            model="openai/gpt-4o",
            instructions="Select planner or coder.",
        )

        team = Agent(
            name="router_test",
            model="openai/gpt-4o",
            agents=[planner, coder],
            strategy="router",
            router=router,
            max_turns=2,
        )
        result = run(team, "Build a hello world function.")
        assert result.output is not None
