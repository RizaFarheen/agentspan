/**
 * Error Recovery -- StateGraph with try/catch in nodes for graceful degradation.
 *
 * Demonstrates:
 *   - Catching exceptions within StateGraph nodes
 *   - Storing error information in state for downstream handling
 *   - A fallback node that generates a graceful response on failure
 *   - Conditional routing based on whether an error occurred
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   builder.addConditionalEdges("fetch", shouldRecover, { ... });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface RecoveryState {
  query: string;
  data: string | null;
  error: string | null;
  response: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function fetchData(state: RecoveryState): Partial<RecoveryState> {
  const query = state.query;
  try {
    // Simulate a failure for queries containing 'fail' or 'error'
    if (/fail|error/i.test(query)) {
      throw new Error(`Simulated fetch failure for query: '${query}'`);
    }

    const data =
      `Fetched data for '${query}': ` +
      'Sample dataset with 100 records, avg value 42.5, max 99, min 1.';
    return { data, error: null };
  } catch (exc) {
    return { data: null, error: String(exc) };
  }
}

function shouldRecover(state: RecoveryState): string {
  return state.error ? 'recover' : 'process';
}

function processData(state: RecoveryState): Partial<RecoveryState> {
  // In production, this would call an LLM
  const response = `Data analysis complete: The dataset contains 100 records with an average value of 42.5, suggesting a normal distribution across the measured parameters.`;
  return { response };
}

function recoverFromError(state: RecoveryState): Partial<RecoveryState> {
  const response =
    `[RECOVERED FROM ERROR]\n` +
    `We encountered an issue while fetching data: ${state.error}\n\n` +
    `Suggestions:\n` +
    `1. Try rephrasing your query with more specific parameters\n` +
    `2. Check if the data source is available and try again later`;
  return { response };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'error_recovery_agent',

  invoke: async (input: Record<string, unknown>) => {
    const query = (input.input as string) ?? '';
    let state: RecoveryState = { query, data: null, error: null, response: '' };

    state = { ...state, ...fetchData(state) };

    if (state.error) {
      state = { ...state, ...recoverFromError(state) };
    } else {
      state = { ...state, ...processData(state) };
    }

    return { output: state.response };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['fetch', {}],
      ['process', {}],
      ['recover', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'fetch'],
      // Conditional: fetch -> process | recover
      ['process', '__end__'],
      ['recover', '__end__'],
    ],
  }),

  nodes: new Map([
    ['fetch', {}],
    ['process', {}],
    ['recover', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const query = (input.input as string) ?? '';
    let state: RecoveryState = { query, data: null, error: null, response: '' };

    state = { ...state, ...fetchData(state) };
    yield ['updates', { fetch: { data: state.data, error: state.error } }];

    if (state.error) {
      state = { ...state, ...recoverFromError(state) };
      yield ['updates', { recover: { response: state.response } }];
    } else {
      state = { ...state, ...processData(state) };
      yield ['updates', { process: { response: state.response } }];
    }

    yield ['values', { output: state.response }];
  },
};

// ---------------------------------------------------------------------------
// Run both paths
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    console.log('=== Happy path ===');
    let result = await runtime.run(graph, 'sales data for Q4');
    console.log('Status:', result.status);
    result.printResult();

    console.log('\n=== Error recovery path ===');
    result = await runtime.run(graph, 'intentionally fail this query');
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
