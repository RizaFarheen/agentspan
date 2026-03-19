# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Agent as Tool — orchestrator dispatching to specialist sub-agents as sub-workflows.

Demonstrates:
    - An orchestrator agent that routes tasks to specialist sub-agents
    - Each specialist is a create_agent() graph compiled as a SUB_WORKFLOW
    - Every agent (orchestrator + specialists) runs as its own Conductor workflow
    - Practical use case: orchestrator dispatching to a math agent, writing agent, and trivia agent

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - OPENAI_API_KEY for ChatOpenAI
"""

from langchain_openai import ChatOpenAI
from agentspan.agents.langchain import create_agent
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


# ── Specialist sub-agents (each compiles as a SUB_WORKFLOW) ───────────────────

math_expert = create_agent(
    llm,
    name="ask_math_expert",
    system_prompt=(
        "You are a math expert. Solve mathematical problems precisely "
        "with step-by-step reasoning."
    ),
)

writing_expert = create_agent(
    llm,
    name="ask_writing_expert",
    system_prompt=(
        "You are a professional writer and editor. "
        "Help craft, improve, and polish written content."
    ),
)

trivia_expert = create_agent(
    llm,
    name="ask_trivia_expert",
    system_prompt=(
        "You are a trivia expert. Answer questions about history, science, "
        "culture, and general knowledge."
    ),
)


# ── Orchestrator agent ────────────────────────────────────────────────────────

graph = create_agent(
    llm,
    tools=[math_expert, writing_expert, trivia_expert],
    name="orchestrator_with_subagents",
    system_prompt=(
        "You are an orchestrator. Route tasks to the appropriate specialist:\n"
        "- Math problems → ask_math_expert\n"
        "- Writing/editing tasks → ask_writing_expert\n"
        "- General knowledge/trivia → ask_trivia_expert\n"
        "Combine the specialist's answer into a final helpful response."
    ),
)

if __name__ == "__main__":
    queries = [
        "What is 15% of 847, rounded to the nearest whole number?",
        "Who invented the World Wide Web and in what year?",
        "Improve this sentence: 'The meeting was went not good and people was unhappy.'",
    ]

    with AgentRuntime() as runtime:
        for query in queries:
            print(f"\nQuery: {query}")
            result = runtime.run(graph, query)
            result.print_result()
            print("-" * 60)
