# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Human-in-the-Loop — approval workflows.

Demonstrates how tools with approval_required=True pause the workflow
until a human approves or rejects the action.  A Conductor HumanTask is
inserted into the compiled workflow so the loop pauses at the right point
and resumes after the reviewer decides.

Requirements:
    - Conductor server with LLM support
    - AGENTSPAN_SERVER_URL=http://localhost:6767/api as environment variable
    - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
"""

from agentspan.agents import Agent, AgentRuntime, EventType, tool
from settings import settings


@tool
def check_balance(account_id: str) -> dict:
    """Check the balance of an account."""
    return {"account_id": account_id, "balance": 15000.00}


@tool(approval_required=True)
def transfer_funds(from_acct: str, to_acct: str, amount: float) -> dict:
    """Transfer funds between accounts. Requires human approval."""
    return {"status": "completed", "from": from_acct, "to": to_acct, "amount": amount}


agent = Agent(
    name="banker",
    model=settings.llm_model,
    tools=[check_balance, transfer_funds],
    instructions="You are a banking assistant. Help with balance inquiries and transfers.",
)


if __name__ == "__main__":
    with AgentRuntime() as runtime:
        # Deploy to server. CLI alternative (recommended for CI/CD):
        #   agentspan deploy examples.09_human_in_the_loop
        # runtime.deploy(agent)
        # runtime.serve(agent)

        result = runtime.run(agent, "What's the balance on ACC-789? ")

        result.print_result()


        # Production pattern:

        # 1. Deploy once during CI/CD:

        # runtime.deploy(agent)

        # CLI alternative:

        # agentspan deploy --package examples.09_human_in_the_loop

        #

        # 2. In a separate long-lived worker process:

        # runtime.serve(agent)


        # Interactive HITL alternative:
        # # start() returns a handle; handle.stream() streams events with HITL support
        handle = runtime.start(agent, "Transfer $500 from ACC-789 to ACC-456")
        print(f"Agent started: {handle.execution_id}\n")

        for event in handle.stream():
            if event.type == EventType.THINKING:
                print(f"  [thinking] {event.content}")

            elif event.type == EventType.TOOL_CALL:
                print(f"  [tool_call] {event.tool_name}({event.args})")

            elif event.type == EventType.TOOL_RESULT:
                print(f"  [tool_result] {event.tool_name} -> {event.result}")

            elif event.type == EventType.WAITING:
                print(f"\n--- Human approval required ---")
                choice = input("  Approve? (y/n): ").strip().lower()
                if choice == "y":
                    handle.approve()
                    print("  Approved!\n")
                else:
                    reason = input("  Rejection reason: ").strip()
                    handle.reject(reason or "Rejected by user")
                    print("  Rejected.\n")

            elif event.type == EventType.ERROR:
                print(f"  [error] {event.content}")

            elif event.type == EventType.DONE:
                print(f"\nResult: {event.output}")

