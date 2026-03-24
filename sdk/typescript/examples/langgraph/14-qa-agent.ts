/**
 * QA Agent -- StateGraph that retrieves context then generates an answer.
 *
 * Demonstrates:
 *   - Two-stage pipeline: retrieve context, then generate answer
 *   - Mocked retrieval step that returns relevant passages
 *   - Grounded answer generation using retrieved context
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock document store (simulates a vector DB retrieval)
// ---------------------------------------------------------------------------
const DOCS: Record<string, string[]> = {
  python: [
    'Python is a high-level, interpreted programming language created by Guido van Rossum in 1991.',
    'Python emphasizes code readability and uses significant indentation.',
    'The Python Package Index (PyPI) hosts over 450,000 packages as of 2024.',
  ],
  'machine learning': [
    'Machine learning is a subset of AI that enables systems to learn from data without explicit programming.',
    'Supervised learning uses labeled datasets; unsupervised learning finds hidden patterns.',
    'Neural networks inspired by the brain are the foundation of deep learning.',
  ],
  kubernetes: [
    'Kubernetes (K8s) is an open-source container orchestration system developed by Google.',
    'It automates deployment, scaling, and management of containerized applications.',
    'Kubernetes uses Pods as the smallest deployable unit.',
  ],
};

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface QAState {
  question: string;
  context: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function retrieveContext(state: QAState): Partial<QAState> {
  const questionLower = state.question.toLowerCase();
  const passages: string[] = [];

  for (const [topic, docs] of Object.entries(DOCS)) {
    if (questionLower.includes(topic)) {
      passages.push(...docs);
    }
  }
  if (passages.length === 0) {
    // Fallback: return first doc from each topic
    for (const docs of Object.values(DOCS)) {
      passages.push(docs[0]);
    }
  }
  const context = passages.map((p) => `* ${p}`).join('\n');
  return { context };
}

function generateAnswer(state: QAState): Partial<QAState> {
  // In production, this would call an LLM with the context
  const answer =
    `Based on the retrieved context: Python is a high-level, interpreted programming ` +
    `language created by Guido van Rossum in 1991. It emphasizes code readability and ` +
    `uses significant indentation. The Python Package Index (PyPI) hosts over 450,000 ` +
    `packages as of 2024.`;
  return { answer };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'qa_agent',

  invoke: async (input: Record<string, unknown>) => {
    const question = (input.input as string) ?? '';
    let state: QAState = { question, context: '', answer: '' };

    state = { ...state, ...retrieveContext(state) };
    state = { ...state, ...generateAnswer(state) };

    return { output: state.answer };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['retrieve', {}],
      ['generate', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'retrieve'],
      ['retrieve', 'generate'],
      ['generate', '__end__'],
    ],
  }),

  nodes: new Map([
    ['retrieve', {}],
    ['generate', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const question = (input.input as string) ?? '';
    let state: QAState = { question, context: '', answer: '' };

    state = { ...state, ...retrieveContext(state) };
    yield ['updates', { retrieve: { context: state.context } }];

    state = { ...state, ...generateAnswer(state) };
    yield ['updates', { generate: { answer: state.answer } }];

    yield ['values', { output: state.answer }];
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
      'What is Python and how many packages does it have?',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
