#!/usr/bin/env python3
"""Parallel Agent — ParallelAgent runs sub-agents concurrently.

Mirrors the pattern from Google ADK samples (story_teller, parallel_task_decomposition).
All sub-agents run in parallel and their results are aggregated.
"""

from google.adk.agents import Agent, ParallelAgent

from agentspan.agents import AgentRuntime


def main():
    # Three analysts run in parallel
    market_analyst = Agent(
        name="market_analyst",
        model="gemini-2.0-flash",
        description="Analyzes market trends.",
        instruction=(
            "You are a market analyst. Given the company or product topic, "
            "provide a brief 2-3 sentence market analysis. Focus on trends and competition."
        ),
    )

    tech_analyst = Agent(
        name="tech_analyst",
        model="gemini-2.0-flash",
        description="Evaluates technology aspects.",
        instruction=(
            "You are a technology analyst. Given the company or product topic, "
            "provide a brief 2-3 sentence technical evaluation. Focus on innovation and capabilities."
        ),
    )

    risk_analyst = Agent(
        name="risk_analyst",
        model="gemini-2.0-flash",
        description="Assesses risks.",
        instruction=(
            "You are a risk analyst. Given the company or product topic, "
            "provide a brief 2-3 sentence risk assessment. Focus on potential challenges."
        ),
    )

    # All three run in parallel
    parallel_analysis = ParallelAgent(
        name="parallel_analysis",
        sub_agents=[market_analyst, tech_analyst, risk_analyst],
    )

    with AgentRuntime() as runtime:
        result = runtime.run(parallel_analysis, "Analyze Tesla's electric vehicle business")
        print(f"Status: {result.status}")
        print(f"Output: {result.output}")


if __name__ == "__main__":
    main()
