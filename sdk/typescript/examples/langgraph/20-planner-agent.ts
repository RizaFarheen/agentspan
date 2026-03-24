/**
 * Planner Agent -- StateGraph with plan -> execute_steps -> review pipeline.
 *
 * Demonstrates:
 *   - A three-stage planning agent: LLM creates a plan, executes each step, then reviews
 *   - Iterating over dynamically generated plan steps in the state
 *   - Using TypedDict with a list of steps and accumulated results
 *   - Practical use case: project breakdown and task execution
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface PlannerState {
  goal: string;
  steps: string[];
  step_results: string[];
  review: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function plan(state: PlannerState): Partial<PlannerState> {
  // In production, the LLM would generate these steps
  const steps = [
    'Step 1: Define the library scope, API, and target audience',
    'Step 2: Set up the project structure with pyproject.toml and CI/CD',
    'Step 3: Implement core validation logic and error messages',
    'Step 4: Write comprehensive tests and documentation',
    'Step 5: Publish to PyPI and announce on social media',
  ];
  return { steps, step_results: [] };
}

function executeSteps(state: PlannerState): Partial<PlannerState> {
  // In production, each step would be executed by the LLM
  const results: string[] = [];
  const mockResults: Record<string, string> = {
    'Step 1':
      'Defined scope: a Pydantic-compatible validation library for REST APIs. Target: Python 3.10+ developers building FastAPI services.',
    'Step 2':
      'Created project with src layout, pyproject.toml using hatch backend, GitHub Actions for CI, and pre-commit hooks.',
    'Step 3':
      'Implemented type validators, custom error types with helpful messages, and a decorator API for field-level validation.',
    'Step 4':
      'Wrote 95% coverage test suite using pytest, created Sphinx docs with examples, and added a quickstart guide.',
    'Step 5':
      'Published v0.1.0 to PyPI, created GitHub release, and posted announcements on Twitter and Reddit r/Python.',
  };

  for (const step of state.steps) {
    const stepKey = step.split(':')[0];
    const result = mockResults[stepKey] ?? `Completed: ${step}`;
    results.push(`[${step}]\n${result}`);
  }

  return { step_results: results };
}

function review(state: PlannerState): Partial<PlannerState> {
  const reviewText =
    `REVIEW: Goal "${state.goal}"\n` +
    `========================================\n\n` +
    `Status: ACHIEVED -- All 5 steps completed successfully.\n\n` +
    `Key Outcomes:\n` +
    `- Library designed with clear API targeting FastAPI developers\n` +
    `- Project infrastructure set up with modern Python tooling\n` +
    `- Core functionality implemented with comprehensive error messages\n` +
    `- 95% test coverage achieved with thorough documentation\n` +
    `- Successfully published and announced\n\n` +
    `Next Actions:\n` +
    `- Monitor PyPI download stats and GitHub issues\n` +
    `- Plan v0.2.0 based on community feedback\n` +
    `- Consider adding async validation support`;

  return { review: reviewText };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'planner_agent',

  invoke: async (input: Record<string, unknown>) => {
    const goal = (input.input as string) ?? '';
    let state: PlannerState = { goal, steps: [], step_results: [], review: '' };

    state = { ...state, ...plan(state) };
    state = { ...state, ...executeSteps(state) };
    state = { ...state, ...review(state) };

    return { output: state.review };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['plan', {}],
      ['execute', {}],
      ['review', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'plan'],
      ['plan', 'execute'],
      ['execute', 'review'],
      ['review', '__end__'],
    ],
  }),

  nodes: new Map([
    ['plan', {}],
    ['execute', {}],
    ['review', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const goal = (input.input as string) ?? '';
    let state: PlannerState = { goal, steps: [], step_results: [], review: '' };

    state = { ...state, ...plan(state) };
    yield ['updates', { plan: { steps: state.steps } }];

    state = { ...state, ...executeSteps(state) };
    yield ['updates', { execute: { step_results_count: state.step_results.length } }];

    state = { ...state, ...review(state) };
    yield ['updates', { review: { review: state.review } }];

    yield ['values', { output: state.review }];
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
      'Launch a new open-source Python library for data validation.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
