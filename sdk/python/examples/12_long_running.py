"""Long-Running Agent — fire-and-forget with status checking.

Demonstrates starting an agent asynchronously and checking its status
from any process. The agent runs as a Conductor workflow and can be
monitored from the UI or via the API.

Requirements:
    - Conductor server with LLM support
    - export CONDUCTOR_SERVER_URL=http://localhost:8080/api
"""

import time

from agentspan.agents import Agent, AgentRuntime
from model_config import get_model

agent = Agent(
    name="saas_analyst",
    model=get_model(),
    instructions=(
        "You are a data analyst. Provide a brief analysis "
        "when asked about data topics."
    ),
)

# Start agent asynchronously (returns immediately)
with AgentRuntime() as runtime:
    handle = runtime.start(agent, "What are the key metrics to track for a SaaS product?")
    print(f"Agent started: {handle.workflow_id}")

    # Poll for completion
    for i in range(30):
        status = handle.get_status()
        print(f"  [{i}s] Status: {status.status} | Complete: {status.is_complete}")
        if status.is_complete:
            print(f"\nResult: {status.output}")
            break
        time.sleep(1)
    else:
        print("\nAgent still running. Check the Conductor UI:")
        print(f"  http://localhost:8080/execution/{handle.workflow_id}")
