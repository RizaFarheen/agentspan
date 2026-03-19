# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Agent Handoff — transferring control to specialist sub-agents as sub-workflows.

Demonstrates:
    - A triage agent that routes to specialist sub-agents
    - Each specialist is a create_agent() graph compiled as a SUB_WORKFLOW
    - Every agent runs as its own Conductor workflow with its own execution ID
    - Practical use case: customer service triage → specialist routing

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - OPENAI_API_KEY for ChatOpenAI
"""

from langchain_openai import ChatOpenAI
from agentspan.agents.langchain import create_agent
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


# ── Specialist sub-agents (each compiles as a SUB_WORKFLOW) ───────────────────

billing_specialist = create_agent(
    llm,
    name="billing_specialist",
    system_prompt=(
        "You are a billing specialist. Answer the customer's billing question "
        "professionally and helpfully. Keep it under 3 sentences. "
        "Prefix your response with [Billing Agent]."
    ),
)

technical_specialist = create_agent(
    llm,
    name="technical_specialist",
    system_prompt=(
        "You are a technical support specialist. Troubleshoot the issue step by step. "
        "Provide clear, actionable guidance in under 4 sentences. "
        "Prefix your response with [Technical Support]."
    ),
)

general_specialist = create_agent(
    llm,
    name="general_specialist",
    system_prompt=(
        "You are a friendly general customer service agent. "
        "Help the customer with their question warmly and concisely. "
        "Prefix your response with [General Support]."
    ),
)


# ── Triage agent ──────────────────────────────────────────────────────────────

graph = create_agent(
    llm,
    tools=[billing_specialist, technical_specialist, general_specialist],
    name="agent_handoff",
    system_prompt=(
        "You are a customer service triage agent.\n\n"
        "Classify each customer message and hand off to the right specialist:\n"
        "- Payment, invoice, charge, subscription, or refund questions → billing_specialist\n"
        "- Software errors, crashes, connectivity or configuration issues → technical_specialist\n"
        "- Account settings, feature questions, or general inquiries → general_specialist\n\n"
        "Call the appropriate specialist agent and return its response directly."
    ),
)

if __name__ == "__main__":
    queries = [
        "I was charged twice for my subscription this month.",
        "My application keeps crashing with a segmentation fault.",
        "Can I change my account email address?",
    ]

    with AgentRuntime() as runtime:
        for query in queries:
            print(f"\nQuery: {query}")
            result = runtime.run(graph, query)
            print(f"Status: {result.status}")
            result.print_result()
            print("-" * 60)
