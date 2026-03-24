/**
 * Human-in-the-Loop -- real human approval gate within a LangGraph workflow.
 *
 * Demonstrates:
 *   - Draft -> Human Review -> Approve/Revise conditional workflow
 *   - A Conductor HUMAN task that pauses execution for actual human input
 *   - The human provides a verdict (APPROVE/REVISE) and feedback
 *   - Conditional routing based on human verdict
 *   - Running the full workflow through Agentspan via runtime.run()
 *
 * The workflow pauses at the review step and waits for a human to approve or
 * reject the draft via the Agentspan UI or API.
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   import { humanTask } from '@agentspan/sdk/frameworks/langgraph';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface EmailState {
  request: string;
  draft: string;
  review_verdict: string;
  review_feedback: string;
  final_email: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function draftEmail(state: EmailState): Partial<EmailState> {
  // In production, this would call an LLM
  const draft =
    `Subject: Team Meeting - Monday 10am, Q3 Plans\n\n` +
    `Hi Team,\n\n` +
    `I'd like to schedule a team meeting for next Monday at 10:00 AM to discuss ` +
    `our Q3 plans and priorities. Please review the attached agenda beforehand.\n\n` +
    `Key topics:\n` +
    `- Q2 retrospective highlights\n` +
    `- Q3 OKRs and milestones\n` +
    `- Resource allocation\n\n` +
    `Please confirm your availability by end of day Friday.\n\n` +
    `Best regards,\n` +
    `[Your Name]`;
  return { draft };
}

function routeAfterReview(state: EmailState): string {
  if (state.review_verdict.toUpperCase() === 'APPROVE') {
    return 'finalize';
  }
  return 'revise';
}

function finalize(state: EmailState): Partial<EmailState> {
  return { final_email: state.draft };
}

function reviseEmail(state: EmailState): Partial<EmailState> {
  // In production, this would call an LLM with the feedback
  const revised =
    `Subject: Team Meeting - Monday 10am, Q3 Plans (Updated)\n\n` +
    `Hi Team,\n\n` +
    `Following reviewer feedback: "${state.review_feedback}"\n\n` +
    `I've updated the meeting invitation for next Monday at 10:00 AM ` +
    `to discuss our Q3 plans.\n\n` +
    `[Revised content addressing feedback]\n\n` +
    `Best regards,\n` +
    `[Your Name]`;
  return { final_email: revised };
}

// ---------------------------------------------------------------------------
// Mock compiled graph with HUMAN task node
// ---------------------------------------------------------------------------
const graph = {
  name: 'email_hitl_agent',

  invoke: async (input: Record<string, unknown>) => {
    const request = (input.input as string) ?? '';
    let state: EmailState = {
      request,
      draft: '',
      review_verdict: '',
      review_feedback: '',
      final_email: '',
    };

    // Step 1: Draft
    state = { ...state, ...draftEmail(state) };

    // Step 2: Simulate human review (in production, this pauses for real human input)
    // The Conductor HUMAN task would collect review_verdict and review_feedback
    state.review_verdict = 'APPROVE';
    state.review_feedback = 'Looks good!';

    // Step 3: Route based on verdict
    if (routeAfterReview(state) === 'finalize') {
      state = { ...state, ...finalize(state) };
    } else {
      state = { ...state, ...reviseEmail(state) };
    }

    return { output: state.final_email };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['draft', {}],
      ['review', { taskType: 'HUMAN' }], // HUMAN task marker
      ['finalize', {}],
      ['revise', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'draft'],
      ['draft', 'review'],
      // Conditional: review -> finalize | revise
      ['finalize', '__end__'],
      ['revise', '__end__'],
    ],
  }),

  nodes: new Map([
    ['draft', {}],
    ['review', { taskType: 'HUMAN' }],
    ['finalize', {}],
    ['revise', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const request = (input.input as string) ?? '';
    let state: EmailState = {
      request,
      draft: '',
      review_verdict: '',
      review_feedback: '',
      final_email: '',
    };

    state = { ...state, ...draftEmail(state) };
    yield ['updates', { draft: { draft: state.draft } }];

    // Simulate human review (in production, execution pauses here)
    state.review_verdict = 'APPROVE';
    state.review_feedback = 'Looks good!';
    yield [
      'updates',
      {
        review: {
          review_verdict: state.review_verdict,
          review_feedback: state.review_feedback,
        },
      },
    ];

    if (routeAfterReview(state) === 'finalize') {
      state = { ...state, ...finalize(state) };
      yield ['updates', { finalize: { final_email: state.final_email } }];
    } else {
      state = { ...state, ...reviseEmail(state) };
      yield ['updates', { revise: { final_email: state.final_email } }];
    }

    yield ['values', { output: state.final_email }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      graph,
      'Schedule a team meeting for next Monday at 10am to discuss Q3 plans.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
