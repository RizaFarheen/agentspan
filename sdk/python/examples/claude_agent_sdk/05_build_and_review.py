#!/usr/bin/env python3
"""Swarm: Claude Code agents build and review a React app until approved.

Architecture:
    build_review_swarm (orchestrator, SWARM strategy)
        ├── builder  (claude-code/sonnet — Write, Edit, Bash, Read)
        └── reviewer (claude-code/sonnet — Read, Glob, Grep)

    builder ──HANDOFF_TO_REVIEWER──> reviewer
    reviewer ──HANDOFF_TO_BUILDER──> builder  (if issues found)
    reviewer ──APPROVED──> done

Usage:
    uv run python examples/claude_agent_sdk/05_build_and_review.py
"""

from agentspan.agents import Agent, AgentRuntime, Strategy
from agentspan.agents.handoff import OnTextMention

PROJECT_DIR = "/tmp/hello-react"

builder = Agent(
    name="builder",
    model="claude-code/sonnet",
    instructions=(
        f"You are a frontend developer. Write code in {PROJECT_DIR}/.\n"
        "Do NOT ask for confirmation — create and edit files directly.\n\n"
        "When you finish building or fixing, say HANDOFF_TO_REVIEWER followed by "
        "a summary of what you did."
    ),
    tools=["Write", "Edit", "Bash", "Read", "Glob"],
    max_turns=15,
)

reviewer = Agent(
    name="reviewer",
    model="claude-code/sonnet",
    instructions=(
        f"You are a senior code reviewer. Review files in {PROJECT_DIR}/.\n"
        "Read the source files and check for:\n"
        "- TypeScript correctness\n"
        "- Accessibility (aria labels, semantic HTML)\n"
        "- Clean code (no unused imports, proper naming)\n"
        "- React best practices\n\n"
        "If there are issues, say HANDOFF_TO_BUILDER followed by the list of issues to fix.\n"
        "If everything looks good, say APPROVED followed by a brief summary."
    ),
    tools=["Read", "Glob", "Grep"],
    max_turns=10,
)

build_review_swarm = Agent(
    name="build_review_swarm",
    model="anthropic/claude-sonnet-4-5",
    instructions=(
        "You orchestrate a build-and-review cycle.\n"
        "1. First, delegate to builder to create the app.\n"
        "2. When builder finishes, delegate to reviewer.\n"
        "3. If reviewer finds issues, send back to builder.\n"
        "4. Repeat until reviewer says APPROVED.\n"
        "5. When approved, output the final summary."
    ),
    agents=[builder, reviewer],
    strategy=Strategy.SWARM,
    handoffs=[
        OnTextMention(text="HANDOFF_TO_REVIEWER", target="reviewer"),
        OnTextMention(text="HANDOFF_TO_BUILDER", target="builder"),
    ],
    max_turns=200,
    timeout_seconds=600,
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            build_review_swarm,
            prompt=(
                f"Create a React app in {PROJECT_DIR}/ using Vite + React + TypeScript.\n"
                f"Run: npm create vite@latest {PROJECT_DIR} -- --template react-ts\n"
                f"Then edit {PROJECT_DIR}/src/App.tsx to show a Hello World page with:\n"
                "- A centered heading saying 'Hello, World!'\n"
                "- A subtitle with a welcome message\n"
                "- A counter button that increments on click\n"
                "- Clean, accessible HTML with proper aria labels\n\n"
                "Start by delegating to builder."
            ),
            timeout=600000,
        )
        print(f"\n{'=' * 60}")
        print(f"Status: {result.status}")
        print(f"Workflow ID: {result.workflow_id}")
        print(f"Output: {result.output}")
        print(f"{'=' * 60}")

        # Show final file
        try:
            with open(f"{PROJECT_DIR}/src/App.tsx") as f:
                print(f"\nFinal App.tsx:\n{f.read()}")
        except FileNotFoundError:
            print("\n(App.tsx not found)")
