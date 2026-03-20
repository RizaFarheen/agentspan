# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Mixed Agent Pipeline — Claude Code Agent used as a tool inside an Agentspan pipeline.

Demonstrates:
    - ClaudeCodeAgent as a sub-agent tool within a multi-agent Agentspan workflow
    - Combining a Claude Code agent (for file work) with other Agentspan agents
    - The Claude agent runs as a Conductor SUB_WORKFLOW, visible in the Conductor UI

Use case: an orchestrator agent that delegates implementation work to Claude Code
while handling coordination and reporting itself.

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - claude CLI installed and authenticated
    - claude-agent-sdk Python package installed
    - OPENAI_API_KEY for the orchestrator agent
"""

import os
from agentspan.agents.frameworks import ClaudeCodeAgent
from agentspan.agents import Agent, tool, AgentRuntime
from langchain_openai import ChatOpenAI

PROJECT_DIR = os.environ.get("PROJECT_DIR", ".")

# Claude Code agent handles file operations
code_agent = ClaudeCodeAgent(
    name="code_implementer",
    cwd=PROJECT_DIR,
    allowed_tools=["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    max_turns=40,
    system_prompt="You are an expert software engineer. Implement tasks precisely and run tests to verify.",
)


@tool
def run_code_agent(task: str) -> str:
    """Delegate a coding task to the Claude Code agent.

    Args:
        task: A clear description of the coding task to perform.

    Returns the result of the coding task.
    """
    with AgentRuntime() as rt:
        result = rt.run(code_agent, task)
        return result.output_data.get("result", str(result.status))


# Orchestrator uses Claude Code agent as a tool
llm = ChatOpenAI(model="gpt-4o", temperature=0)

from agentspan.agents.langchain import create_agent

orchestrator = create_agent(
    llm,
    tools=[run_code_agent],
    system_prompt=(
        "You are a tech lead. Break down complex engineering tasks into specific, "
        "actionable coding tasks and delegate them to the code agent. "
        "Review the results and provide a final summary."
    ),
    name="tech_lead_orchestrator",
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            orchestrator,
            "Add type hints to all Python functions in the project that are missing them, "
            "then run the tests to make sure nothing broke.",
        )
        print(f"Status: {result.status}")
        result.print_result()
