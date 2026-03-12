# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""First-class local code execution — agents that write and run code.

Demonstrates three ways to enable code execution on an agent:

1. Simple flag: ``local_code_execution=True``
2. With restrictions: ``allowed_languages`` + ``allowed_commands``
3. Full config: ``CodeExecutionConfig`` with a custom executor

When ``local_code_execution=True``, the agent automatically gets an
``execute_code`` tool.  The LLM calls it via native function calling —
no manual executor setup needed.

Requirements:
    - Conductor server with LLM support
    - export AGENTSPAN_SERVER_URL=http://localhost:8080/api
"""

from agentspan.agents import Agent, AgentRuntime, CodeExecutionConfig
from model_config import get_model


# ── Example 1: Simple flag ─────────────────────────────────────────────
# Just flip local_code_execution=True — defaults to Python, no restrictions.

simple_coder = Agent(
    name="simple_coder",
    model=get_model(),
    local_code_execution=True,
    instructions="You are a Python developer. Write and execute code to solve problems.",
)

# ── Example 2: With restrictions ───────────────────────────────────────
# Allow Python + Bash, but only permit pip and ls commands.

restricted_coder = Agent(
    name="restricted_coder",
    model=get_model(),
    local_code_execution=True,
    allowed_languages=["python", "bash"],
    allowed_commands=["pip", "ls", "cat", "git"],
    instructions=(
        "You are a developer with restricted shell access. "
        "You can write Python and Bash code, but only use "
        "pip, ls, cat, and git commands."
    ),
)

# ── Example 3: Full CodeExecutionConfig ────────────────────────────────
# Use CodeExecutionConfig for full control over executor, timeout, etc.

config_coder = Agent(
    name="config_coder",
    model=get_model(),
    code_execution=CodeExecutionConfig(
        allowed_languages=["python"],
        allowed_commands=["pip"],
        timeout=60,
    ),
    instructions="You are a Python developer with a 60s timeout and pip access only.",
)

# ── Run ─────────────────────────────────────────────────────────────

with AgentRuntime() as runtime:
    print("--- Simple Code Execution ---")
    result = runtime.run(
        simple_coder,
        "Write a Python function to find the first 10 prime numbers and print them.",
    )
    result.print_result()

    print("\n--- Restricted Code Execution ---")
    result = runtime.run(
        restricted_coder,
        "List the files in the current directory using bash.",
    )
    result.print_result()
