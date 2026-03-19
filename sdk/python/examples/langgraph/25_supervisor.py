# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Supervisor — multi-agent supervisor pattern with proper sub-workflows.

Demonstrates:
    - A supervisor agent that dispatches to specialist sub-agents
    - Each specialist is a create_agent() graph compiled as a SUB_WORKFLOW
    - Every agent (supervisor + specialists) runs as its own Conductor workflow
    - Practical use case: research → writing → editing pipeline

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - OPENAI_API_KEY for ChatOpenAI
"""

from langchain_openai import ChatOpenAI
from agentspan.agents.langchain import create_agent
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


# ── Specialist sub-agents (each compiles as a SUB_WORKFLOW) ───────────────────

researcher = create_agent(
    llm,
    name="researcher",
    system_prompt=(
        "You are a researcher. When given a topic, gather key facts and insights "
        "and return them as 3-5 concise bullet points."
    ),
)

writer = create_agent(
    llm,
    name="writer",
    system_prompt=(
        "You are a writer. When given a topic and research notes, write a short "
        "article of 3 paragraphs based on those notes."
    ),
)

editor = create_agent(
    llm,
    name="editor",
    system_prompt=(
        "You are an editor. When given a draft article, improve its clarity, "
        "flow, and correctness. Return the polished version only."
    ),
)


# ── Supervisor agent ──────────────────────────────────────────────────────────

graph = create_agent(
    llm,
    tools=[researcher, writer, editor],
    name="supervisor_multiagent",
    system_prompt=(
        "You are a content production supervisor.\n\n"
        "For each article request, orchestrate the pipeline in order:\n"
        "1. Call researcher with the topic to gather facts and insights\n"
        "2. Call writer with the topic and the research notes to create a draft\n"
        "3. Call editor with the draft to produce the polished final article\n"
        "4. Return the final polished article to the user\n\n"
        "Always complete all three specialist tasks in sequence."
    ),
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(graph, "The impact of large language models on software development")
        print(f"Status: {result.status}")
        result.print_result()
