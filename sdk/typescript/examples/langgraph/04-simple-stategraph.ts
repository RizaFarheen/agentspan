/**
 * Simple StateGraph -- custom query -> process -> answer pipeline.
 *
 * Demonstrates:
 *   - Defining a typed state schema
 *   - Building a StateGraph with multiple sequential nodes
 *   - Connecting nodes with add_edge
 *   - Compiling and naming the graph
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   const builder = new StateGraph<State>(stateSchema);
 *   builder.addNode("validate", validateQuery);
 *   ...
 *   const graph = builder.compile({ name: "query_pipeline" });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type (mirrors Python TypedDict)
// ---------------------------------------------------------------------------
interface QueryState {
  query: string;
  refined_query: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function validateQuery(state: QueryState): Partial<QueryState> {
  let query = (state.query ?? '').trim();
  if (!query) {
    query = 'What can you help me with?';
  }
  return { query, refined_query: '', answer: '' };
}

function refineQuery(state: QueryState): Partial<QueryState> {
  // In production, this would call an LLM
  const refined = `Please provide a detailed and comprehensive explanation of: ${state.query}`;
  return { refined_query: refined };
}

function generateAnswer(state: QueryState): Partial<QueryState> {
  const q = state.refined_query || state.query;
  // In production, this would call an LLM
  const answer = `Python is a versatile, high-level programming language created by Guido van Rossum in 1991. It emphasizes readability and supports multiple paradigms including procedural, object-oriented, and functional programming.`;
  return { answer };
}

// ---------------------------------------------------------------------------
// Mock compiled graph (simulates StateGraph().compile())
// ---------------------------------------------------------------------------
const graph = {
  name: 'query_pipeline',

  invoke: async (input: Record<string, unknown>) => {
    const prompt = (input.input as string) ?? '';
    let state: QueryState = { query: prompt, refined_query: '', answer: '' };

    // Run pipeline: validate -> refine -> answer
    state = { ...state, ...validateQuery(state) };
    state = { ...state, ...refineQuery(state) };
    state = { ...state, ...generateAnswer(state) };

    return { output: state.answer };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['validate', {}],
      ['refine', {}],
      ['answer', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'validate'],
      ['validate', 'refine'],
      ['refine', 'answer'],
      ['answer', '__end__'],
    ],
  }),

  nodes: new Map([
    ['validate', {}],
    ['refine', {}],
    ['answer', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const prompt = (input.input as string) ?? '';
    let state: QueryState = { query: prompt, refined_query: '', answer: '' };

    state = { ...state, ...validateQuery(state) };
    yield ['updates', { validate: { query: state.query } }];

    state = { ...state, ...refineQuery(state) };
    yield ['updates', { refine: { refined_query: state.refined_query } }];

    state = { ...state, ...generateAnswer(state) };
    yield ['updates', { answer: { answer: state.answer } }];

    yield ['values', { output: state.answer }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(graph, 'Tell me about Python');
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
