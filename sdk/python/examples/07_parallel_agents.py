# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Parallel Agents — fan-out / fan-in.

Demonstrates the parallel strategy where all sub-agents run concurrently
on the same input and their results are aggregated.

Requirements:
    - Conductor server with LLM support
    - export AGENTSPAN_SERVER_URL=http://localhost:7001/api
"""

from agentspan.agents import Agent, AgentRuntime, Strategy
from model_config import get_model

# ── Specialist analysts ─────────────────────────────────────────────

market_analyst = Agent(
    name="market_analyst",
    model=get_model(),
    instructions=(
        "You are a market analyst. Analyze the given topic from a market perspective: "
        "market size, growth trends, key players, and opportunities."
    ),
)

risk_analyst = Agent(
    name="risk_analyst",
    model=get_model(),
    instructions=(
        "You are a risk analyst. Analyze the given topic for risks: "
        "regulatory risks, technical risks, competitive threats, and mitigation strategies."
    ),
)

compliance_checker = Agent(
    name="compliance",
    model=get_model(),
    instructions=(
        "You are a compliance specialist. Check the given topic for compliance considerations: "
        "data privacy, regulatory requirements, and industry standards."
    ),
)

# ── Parallel analysis ───────────────────────────────────────────────

analysis = Agent(
    name="analysis",
    model=get_model(),
    agents=[market_analyst, risk_analyst, compliance_checker],
    strategy=Strategy.PARALLEL,
)

with AgentRuntime() as runtime:
    result = runtime.run(analysis, "Launching an AI-powered healthcare diagnostic tool in the US market")
    result.print_result()
