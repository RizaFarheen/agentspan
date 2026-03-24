/**
 * Parallel Branches -- StateGraph with two concurrent paths that merge.
 *
 * Demonstrates:
 *   - Fan-out from a single node to two parallel branches
 *   - Using list reducers to safely merge results
 *   - Fan-in merge node that combines results from both branches
 *   - Practical use case: parallel pros/cons analysis
 *
 * In production you would use:
 *   import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
 *   // Fan-out: builder.addEdge(START, "pros"); builder.addEdge(START, "cons");
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface AnalysisState {
  topic: string;
  pros: string;
  cons: string;
  branch_outputs: string[];
  final_summary: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function analyzePros(state: AnalysisState): Partial<AnalysisState> {
  const pros =
    `1. Increased flexibility and work-life balance\n` +
    `2. Eliminates commute time, saving hours each week\n` +
    `3. Access to a global talent pool, enabling diverse teams`;
  return {
    pros,
    branch_outputs: [`PROS:\n${pros}`],
  };
}

function analyzeCons(state: AnalysisState): Partial<AnalysisState> {
  const cons =
    `1. Social isolation and reduced team cohesion\n` +
    `2. Blurred boundaries between work and personal life\n` +
    `3. Communication challenges and meeting fatigue`;
  return {
    cons,
    branch_outputs: [`CONS:\n${cons}`],
  };
}

function mergeAndSummarize(state: AnalysisState): Partial<AnalysisState> {
  const combined = state.branch_outputs.join('\n\n');
  const summary =
    `Remote work for software engineers offers significant advantages in flexibility ` +
    `and access to talent, but requires intentional effort to maintain team culture ` +
    `and healthy boundaries. Organizations should adopt hybrid models with regular ` +
    `in-person touchpoints while investing in async communication tools to capture ` +
    `the best of both worlds.`;
  return { final_summary: summary };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'parallel_analysis',

  invoke: async (input: Record<string, unknown>) => {
    const topic = (input.input as string) ?? '';
    let state: AnalysisState = {
      topic,
      pros: '',
      cons: '',
      branch_outputs: [],
      final_summary: '',
    };

    // Simulate parallel execution (both branches run)
    const prosResult = analyzePros(state);
    const consResult = analyzeCons(state);

    // Merge branch outputs (simulating list reducer via concatenation)
    state = {
      ...state,
      pros: prosResult.pros!,
      cons: consResult.cons!,
      branch_outputs: [
        ...(prosResult.branch_outputs ?? []),
        ...(consResult.branch_outputs ?? []),
      ],
    };

    state = { ...state, ...mergeAndSummarize(state) };

    return { output: state.final_summary };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['pros', {}],
      ['cons', {}],
      ['merge', {}],
      ['__end__', {}],
    ]),
    edges: [
      // Fan-out: START -> pros, START -> cons
      ['__start__', 'pros'],
      ['__start__', 'cons'],
      // Fan-in: pros -> merge, cons -> merge
      ['pros', 'merge'],
      ['cons', 'merge'],
      ['merge', '__end__'],
    ],
  }),

  nodes: new Map([
    ['pros', {}],
    ['cons', {}],
    ['merge', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const topic = (input.input as string) ?? '';
    let state: AnalysisState = {
      topic,
      pros: '',
      cons: '',
      branch_outputs: [],
      final_summary: '',
    };

    const prosResult = analyzePros(state);
    yield ['updates', { pros: { pros: prosResult.pros } }];

    const consResult = analyzeCons(state);
    yield ['updates', { cons: { cons: consResult.cons } }];

    state = {
      ...state,
      pros: prosResult.pros!,
      cons: consResult.cons!,
      branch_outputs: [
        ...(prosResult.branch_outputs ?? []),
        ...(consResult.branch_outputs ?? []),
      ],
    };

    state = { ...state, ...mergeAndSummarize(state) };
    yield ['updates', { merge: { final_summary: state.final_summary } }];

    yield ['values', { output: state.final_summary }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(graph, 'remote work for software engineers');
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
