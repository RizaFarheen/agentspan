/**
 * 61 - GitHub Coding Agent (Chained) — conditional sequential pipeline.
 *
 * Demonstrates:
 *   - Sequential pipeline with gate (conditional execution)
 *   - SWARM orchestration nested inside a pipeline stage
 *   - cliCommands for stages that only run CLI tools
 *   - localCodeExecution for stages that write/run code
 *
 * Architecture:
 *   pipeline = gitFetchIssues >> codingQA >> gitPushPR
 *
 * Requirements:
 *   - Conductor server running
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - gh CLI authenticated
 */

import { Agent, AgentRuntime, OnTextMention, TextGate } from '../src/index.js';

const REPO = 'agentspan/codingexamples';
const MODEL = 'anthropic/claude-sonnet-4-6';

// -- Stage 1: Fetch issues ---------------------------------------------------

const gitFetchIssues = new Agent({
  name: 'git_fetch_issues',
  model: MODEL,
  instructions:
    `You are a GitHub issue fetcher.\n\n` +
    `1. List the 5 most recent open issues on ${REPO} (include number, title, body).\n` +
    `2. If there are NO open issues, output exactly: NO_OPEN_ISSUES\n` +
    `3. Otherwise pick the most suitable issue, then:\n` +
    `   - Create a temp dir: mktemp -d /tmp/fetch-XXXXXXXX\n` +
    `   - Clone ${REPO} into that dir and create branch fix/issue-<NUMBER>\n` +
    `   - Push the branch to origin immediately\n` +
    `   - Delete the temp dir.\n` +
    `   - Output ONLY these lines:\n` +
    `       REPO: ${REPO}\n` +
    `       BRANCH: fix/issue-<NUMBER>\n` +
    `       ISSUE: #<NUMBER> <title>\n` +
    `       SUMMARY: <one-sentence description>`,
  cliConfig: { enabled: true, allowedCommands: ['gh', 'git', 'mktemp', 'rm'] },
  maxTurns: 20,
  gate: new TextGate({ text: 'NO_OPEN_ISSUES' }),
});

// -- Stage 2: Coding + QA (SWARM) -------------------------------------------

const coderStage = new Agent({
  name: 'coder',
  model: MODEL,
  maxTokens: 60000,
  instructions:
    'You are a senior developer. Your task description contains REPO, BRANCH, ISSUE, and SUMMARY.\n\n' +
    '1. Create a fresh temp dir: mktemp -d /tmp/coder-XXXXXXXX\n' +
    '2. Clone the repo and check out the branch\n' +
    '3. Implement the fix described in ISSUE/SUMMARY\n' +
    '4. Commit your changes with a descriptive message\n' +
    '5. Push: git push origin <BRANCH>\n' +
    '6. Delete the temp dir\n' +
    '7. Say HANDOFF_TO_QA followed by REPO/BRANCH/CHANGES lines',
  codeExecutionConfig: { enabled: true },
});

const qaStage = new Agent({
  name: 'qa_tester',
  model: MODEL,
  instructions:
    'You are a QA engineer. Your task description contains REPO, BRANCH, and CHANGES.\n\n' +
    '1. Create a fresh temp dir and clone the repo/branch\n' +
    '2. Review the changed files and run tests\n' +
    '3. Delete the temp dir\n' +
    '4. If bugs: say HANDOFF_TO_CODER with details\n' +
    '5. If good: say QA_APPROVED followed by REPO/BRANCH/SUMMARY lines',
  codeExecutionConfig: { enabled: true },
  maxTokens: 60000,
  maxTurns: 5,
});

const codingQA = new Agent({
  name: 'coding_qa',
  model: MODEL,
  instructions:
    'Your task description contains REPO, BRANCH, ISSUE, and SUMMARY. ' +
    'Delegate to coder to implement the fix, passing REPO, BRANCH, and the task details. ' +
    'Once coder completes, delegate to qa_tester. ' +
    'If QA does not pass, send it back to coder to fix. ' +
    'When QA approves, output ONLY these lines:\n' +
    '  REPO: <repo>\n' +
    '  BRANCH: <branch>\n' +
    '  SUMMARY: <what was implemented and verified>',
  agents: [coderStage, qaStage],
  strategy: 'swarm',
  handoffs: [
    new OnTextMention({ text: 'HANDOFF_TO_QA', target: 'qa_tester' }),
    new OnTextMention({ text: 'HANDOFF_TO_CODER', target: 'coder' }),
  ],
  maxTurns: 200,
  maxTokens: 60000,
  timeoutSeconds: 6000,
});

// -- Stage 3: Create PR ------------------------------------------------------

const gitPushPR = new Agent({
  name: 'git_push_pr',
  model: MODEL,
  instructions:
    'You are a GitHub PR creator. Your task description contains REPO, BRANCH, and SUMMARY.\n' +
    'The branch is already pushed -- your only job is to open a pull request.\n\n' +
    '1. Create the PR: gh pr create --repo <REPO> --base main --head <BRANCH> --title "<title>" --body "<summary>"\n' +
    '2. Output the PR URL.',
  cliConfig: { enabled: true, allowedCommands: ['gh'] },
  maxTokens: 60000,
  maxTurns: 10,
});

// -- Pipeline ----------------------------------------------------------------

const pipeline = gitFetchIssues.pipe(codingQA).pipe(gitPushPR);

// Just deploy (since serve is blocking, per the Python source)
const runtime = new AgentRuntime();
try {
  const info = await runtime.deploy(pipeline);
  console.log(`Deployed: ${info.agentName} -> ${info.workflowName}`);
  console.log('Pipeline deployed. Use runtime.serve() to start workers.');
} finally {
  await runtime.shutdown();
}
