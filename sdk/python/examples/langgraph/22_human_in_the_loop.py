# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Human-in-the-Loop — interrupt/resume workflow for human approval.

Demonstrates:
    - Using interrupt_before to pause at a node for human review
    - Resuming a graph with a MemorySaver checkpointer after human feedback
    - Practical use case: draft an email, wait for human approval, then send

    NOTE: This example simulates the human approval step locally.
          In production the graph would be stored by Agentspan between turns.

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - OPENAI_API_KEY for ChatOpenAI
"""

from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


class EmailState(TypedDict):
    request: str
    draft: str
    human_feedback: str
    final_email: str


def draft_email(state: EmailState) -> EmailState:
    response = llm.invoke([
        SystemMessage(content="You are a professional email writer. Draft a concise, polite email."),
        HumanMessage(content=f"Request: {state['request']}"),
    ])
    return {"draft": response.content.strip()}


def human_review(state: EmailState) -> EmailState:
    """This node is interrupted before execution so a human can provide feedback."""
    feedback = state.get("human_feedback", "")
    if not feedback or feedback.lower() == "approve":
        return {"final_email": state["draft"]}
    return {}


def revise_email(state: EmailState) -> EmailState:
    if not state.get("human_feedback"):
        return {"final_email": state["draft"]}
    response = llm.invoke([
        SystemMessage(content="Revise the email draft based on the feedback provided."),
        HumanMessage(
            content=f"Original draft:\n{state['draft']}\n\nFeedback:\n{state['human_feedback']}"
        ),
    ])
    return {"final_email": response.content.strip()}


def should_revise(state: EmailState) -> str:
    feedback = state.get("human_feedback", "")
    if feedback and feedback.lower() not in ("approve", "ok", "looks good"):
        return "revise"
    return "done"


builder = StateGraph(EmailState)
builder.add_node("draft", draft_email)
builder.add_node("human_review", human_review)
builder.add_node("revise", revise_email)

builder.add_edge(START, "draft")
builder.add_edge("draft", "human_review")
builder.add_conditional_edges("human_review", should_revise, {"revise": "revise", "done": END})
builder.add_edge("revise", END)

# MemorySaver checkpointer enables interrupt/resume between turns
checkpointer = MemorySaver()
graph = builder.compile(
    name="email_hitl_agent",
    checkpointer=checkpointer,
    interrupt_before=["human_review"],
)

if __name__ == "__main__":
    thread_config = {"configurable": {"thread_id": "email-thread-1"}}

    # ── Turn 1: draft the email ───────────────────────────────────────────────
    print("=== Turn 1: drafting email ===")
    for mode, chunk in graph.stream(
        {"request": "Schedule a team meeting for next Monday at 10am to discuss Q3 plans."},
        thread_config,
        stream_mode=["updates", "values"],
    ):
        if mode == "updates":
            for node, updates in chunk.items():
                if "draft" in updates:
                    print(f"\nDraft:\n{updates['draft']}\n")

    # ── Simulate human approval ───────────────────────────────────────────────
    print("=== Turn 2: human approves ===")
    for mode, chunk in graph.stream(
        {"human_feedback": "approve"},
        thread_config,
        stream_mode=["updates", "values"],
    ):
        if mode == "values" and chunk.get("final_email"):
            print(f"Final email:\n{chunk['final_email']}")
