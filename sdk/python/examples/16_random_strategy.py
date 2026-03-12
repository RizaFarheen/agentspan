# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Random Strategy — random agent selection each turn.

Demonstrates the ``strategy="random"`` pattern where a random sub-agent
is selected each iteration.  Unlike round-robin (fixed rotation), random
selection adds variety — useful for brainstorming or diverse perspectives.

Requirements:
    - Conductor server with LLM support
    - export AGENTSPAN_SERVER_URL=http://localhost:8080/api
"""

from agentspan.agents import Agent, AgentRuntime, Strategy
from model_config import get_model

creative = Agent(
    name="creative",
    model=get_model(),
    instructions=(
        "You are a creative thinker. Suggest innovative, unconventional ideas. "
        "Keep your response to 2-3 sentences."
    ),
)

practical = Agent(
    name="practical",
    model=get_model(),
    instructions=(
        "You are a practical thinker. Focus on feasibility and cost-effectiveness. "
        "Keep your response to 2-3 sentences."
    ),
)

critical = Agent(
    name="critical",
    model=get_model(),
    instructions=(
        "You are a critical thinker. Identify risks and potential issues. "
        "Keep your response to 2-3 sentences."
    ),
)

# Random selection: each turn, one of the three agents is picked at random
brainstorm = Agent(
    name="brainstorm",
    model=get_model(),
    agents=[creative, practical, critical],
    strategy=Strategy.RANDOM,
    max_turns=6,
)

with AgentRuntime() as runtime:
    result = runtime.run(
        brainstorm,
        "How should we approach building an AI-powered customer service platform?",
    )
    result.print_result()
