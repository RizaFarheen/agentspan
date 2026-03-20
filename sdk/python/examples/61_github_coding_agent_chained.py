# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""GitHub Coding Agent (Chained) — conditional sequential pipeline.

Demonstrates:
    - Sequential pipeline with gate (conditional execution)
    - SWARM orchestration nested inside a pipeline stage
    - Clean separation of concerns: fetch -> code -> push
    - ``cli_commands`` for stages that only run CLI tools (stages 1 & 3)
    - ``local_code_execution`` for stages that write/run code (stage 2)
    - Distributed-safe handover: git is the shared state, not the local filesystem

Architecture:
    pipeline = git_fetch_issues >> coding_qa >> git_push_pr

    git_fetch_issues --gate--> coding_qa (coder <-> qa_tester) --> git_push_pr

    Gate: if no open issues, pipeline stops after stage 1.
    Each stage receives the previous stage's output as its prompt.

Handover contract (what each stage outputs for the next):
    Stage 1 → Stage 2:  REPO / BRANCH / ISSUE / SUMMARY lines
    Stage 2 → Stage 3:  REPO / BRANCH / SUMMARY lines (branch already pushed)
    Stage 3:            PR URL

    Each stage does a fresh clone from the remote branch, so stages can
    run on different machines with no shared filesystem.

Requirements:
    - Conductor server running
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api in .env or environment
    - gh CLI authenticated (gh auth status)
    - GITHUB_TOKEN or GH_TOKEN set for API access
"""

from agentspan.agents import Agent, AgentRuntime, Strategy
from agentspan.agents.gate import TextGate
from agentspan.agents.handoff import OnTextMention

REPO = "agentspan/codingexamples"
MODEL = "anthropic/claude-sonnet-4-6"

# -- Stage 1: Fetch issues -------------------------------------------------
# Stage 1 creates a branch on the remote and outputs only REPO/BRANCH/ISSUE/SUMMARY.
# No local path is forwarded — git is the shared state between stages.

git_fetch_issues = Agent(
    name="git_fetch_issues",
    model=MODEL,
    instructions=f"""\
You are a GitHub issue fetcher.

1. List the 5 most recent open issues on {REPO} (include number, title, body).
2. If there are NO open issues, output exactly: NO_OPEN_ISSUES
3. Otherwise pick the most suitable issue, then:
   - Create a temp dir: `mktemp -d /tmp/fetch-XXXXXXXX`
   - Clone {REPO} into that dir and create branch fix/issue-<NUMBER>
   - Push the branch to origin immediately: `git push -u origin fix/issue-<NUMBER>`
   - Delete the temp dir (it is no longer needed).
   - Output ONLY these lines, nothing else:
       REPO: {REPO}
       BRANCH: fix/issue-<NUMBER>
       ISSUE: #<NUMBER> <title>
       SUMMARY: <one-sentence description of what needs to be done>
""",
    cli_commands=True,
    cli_allowed_commands=["gh", "git", "mktemp", "rm"],
    max_turns=20,
    gate=TextGate("NO_OPEN_ISSUES"),
)

# -- Stage 2: Coding + QA (SWARM) ------------------------------------------
# Each agent does a fresh clone from the remote branch — no shared filesystem.
# Coder pushes changes before handing off to QA; QA pulls to review.

coder = Agent(
    name="coder",
    model=MODEL,
    max_tokens=60000,
    instructions="""\
You are a senior developer. Your task description contains REPO, BRANCH, ISSUE, and SUMMARY.

1. Create a fresh temp dir: `mktemp -d /tmp/coder-XXXXXXXX`
2. Clone the repo and check out the branch:
     git clone https://github.com/<REPO> <dir>
     cd <dir> && git checkout <BRANCH>
3. Implement the fix described in ISSUE/SUMMARY.
   For a new feature, create a new folder with a name that reflects the requirements.
4. Commit your changes with a descriptive message.
5. Push: `git push origin <BRANCH>`
6. Delete the temp dir.
7. Say HANDOFF_TO_QA followed by:
     REPO: <repo>
     BRANCH: <branch>
     CHANGES: <brief description of what you implemented>
""",
    local_code_execution=True,
)

qa_tester = Agent(
    name="qa_tester",
    model=MODEL,
    instructions="""\
You are a QA engineer. Your task description contains REPO, BRANCH, and CHANGES.

1. Create a fresh temp dir: `mktemp -d /tmp/qa-XXXXXXXX`
2. Clone the repo and check out the branch:
     git clone https://github.com/<REPO> <dir>
     cd <dir> && git checkout <BRANCH>
3. Review the changed files and run any existing tests (`python -m pytest` if applicable).
4. Delete the temp dir.
5. If you find bugs, say HANDOFF_TO_CODER followed by a description of what to fix.
6. If everything looks good, say QA_APPROVED followed by:
     REPO: <repo>
     BRANCH: <branch>
     SUMMARY: <what was tested and confirmed working>
""",
    local_code_execution=True,
    max_tokens=60000,
    max_turns=5,
)

coding_qa = Agent(
    name="coding_qa",
    model=MODEL,
    instructions="Your task description contains REPO, BRANCH, ISSUE, and SUMMARY. "
                 "Delegate to coder to implement the fix, passing REPO, BRANCH, and the task details. "
                 "Once coder completes, delegate to qa_tester. "
                 "If QA does not pass, send it back to coder to fix. "
                 "When QA approves, output ONLY these lines as your final message:\n"
                 "  REPO: <repo>\n"
                 "  BRANCH: <branch>\n"
                 "  SUMMARY: <what was implemented and verified>",
    agents=[coder, qa_tester],
    strategy=Strategy.SWARM,
    handoffs=[
        OnTextMention(text="HANDOFF_TO_QA", target="qa_tester"),
        OnTextMention(text="HANDOFF_TO_CODER", target="coder"),
    ],
    max_turns=200,
    max_tokens=60000,
    timeout_seconds=6000,
)

# -- Stage 3: Create PR ----------------------------------------------------
# Task description contains REPO, BRANCH, and SUMMARY from stage 2.
# The branch is already fully pushed — no local clone needed.

git_push_pr = Agent(
    name="git_push_pr",
    model=MODEL,
    instructions=f"""\
You are a GitHub PR creator. Your task description contains REPO, BRANCH, and SUMMARY.
The branch is already pushed to origin — your only job is to open a pull request.

1. Create the PR:
     gh pr create --repo <REPO> --base main --head <BRANCH> \\
       --title "<concise title>" --body "<summary of changes>"
2. Output the PR URL.
""",
    cli_commands=True,
    max_tokens=60000,
    max_turns=10,
    cli_allowed_commands=["gh"],
)

# -- Pipeline ---------------------------------------------------------------

pipeline = git_fetch_issues >> coding_qa >> git_push_pr

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        runtime.deploy(pipeline)
        runtime.serve(pipeline)
        # result = runtime.run(pipeline, "Pick an open issue and create a PR.", timeout=240000)
        # result.print_result()
