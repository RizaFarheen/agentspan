/**
 * Subgraph -- composing graphs within graphs.
 *
 * Demonstrates:
 *   - Building a nested subgraph for a specific subtask
 *   - Connecting a subgraph as a node in a parent graph
 *   - Passing state between parent graph and subgraph
 *   - Practical use case: document processing pipeline with a nested analysis subgraph
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   const subgraph = subBuilder.compile();
 *   parentBuilder.addNode("analysis", subgraph);
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Subgraph state and functions
// ---------------------------------------------------------------------------
interface AnalysisState {
  text: string;
  sentiment: string;
  keywords: string[];
  summary: string;
}

function analyzeSentiment(state: AnalysisState): Partial<AnalysisState> {
  const text = state.text.toLowerCase();
  const positive = ['love', 'easy', 'flexibility', 'great', 'excellent'];
  const negative = ['hard', 'difficult', 'terrible', 'complex'];
  const posCount = positive.filter((w) => text.includes(w)).length;
  const negCount = negative.filter((w) => text.includes(w)).length;

  let sentiment: string;
  if (posCount > negCount) sentiment = 'positive';
  else if (negCount > posCount) sentiment = 'negative';
  else sentiment = 'neutral';

  return { sentiment };
}

function extractKeywords(state: AnalysisState): Partial<AnalysisState> {
  // Simple keyword extraction (mock)
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'it', 'to', 'and', 'of', 'for', 'in', 'with',
    'its', 'that', 'using', 'makes',
  ]);
  const words = state.text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Count frequencies and take top 5
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  return { keywords };
}

function summarizeText(state: AnalysisState): Partial<AnalysisState> {
  const sentences = state.text.split('.').filter((s) => s.trim().length > 10);
  const summary = sentences.slice(0, 1).join('. ').trim() + '.';
  return { summary };
}

// Mock subgraph compiled object
function runAnalysisSubgraph(text: string): AnalysisState {
  let state: AnalysisState = { text, sentiment: '', keywords: [], summary: '' };
  state = { ...state, ...analyzeSentiment(state) };
  state = { ...state, ...extractKeywords(state) };
  state = { ...state, ...summarizeText(state) };
  return state;
}

// ---------------------------------------------------------------------------
// Parent graph state and functions
// ---------------------------------------------------------------------------
interface DocumentState {
  document: string;
  analysis_text: string;
  sentiment: string;
  keywords: string[];
  summary: string;
  report: string;
}

function prepare(state: DocumentState): Partial<DocumentState> {
  return { analysis_text: state.document };
}

function runAnalysis(state: DocumentState): Partial<DocumentState> {
  const result = runAnalysisSubgraph(state.analysis_text);
  return {
    sentiment: result.sentiment,
    keywords: result.keywords,
    summary: result.summary,
  };
}

function buildReport(state: DocumentState): Partial<DocumentState> {
  const report =
    `Document Analysis Report\n` +
    `========================\n` +
    `Sentiment:  ${state.sentiment}\n` +
    `Keywords:   ${state.keywords.join(', ')}\n` +
    `Summary:    ${state.summary}`;
  return { report };
}

// ---------------------------------------------------------------------------
// Mock compiled graph (parent with subgraph)
// ---------------------------------------------------------------------------
const graph = {
  name: 'document_pipeline_with_subgraph',

  invoke: async (input: Record<string, unknown>) => {
    const document = (input.input as string) ?? '';
    let state: DocumentState = {
      document,
      analysis_text: '',
      sentiment: '',
      keywords: [],
      summary: '',
      report: '',
    };

    state = { ...state, ...prepare(state) };
    state = { ...state, ...runAnalysis(state) };
    state = { ...state, ...buildReport(state) };

    return { output: state.report };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['prepare', {}],
      ['analysis', {}], // subgraph node
      ['build_report', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'prepare'],
      ['prepare', 'analysis'],
      ['analysis', 'build_report'],
      ['build_report', '__end__'],
    ],
  }),

  nodes: new Map([
    ['prepare', {}],
    ['analysis', {}],
    ['build_report', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const document = (input.input as string) ?? '';
    let state: DocumentState = {
      document,
      analysis_text: '',
      sentiment: '',
      keywords: [],
      summary: '',
      report: '',
    };

    state = { ...state, ...prepare(state) };
    yield ['updates', { prepare: { analysis_text: '(extracted)' } }];

    state = { ...state, ...runAnalysis(state) };
    yield [
      'updates',
      {
        analysis: {
          sentiment: state.sentiment,
          keywords: state.keywords,
          summary: state.summary,
        },
      },
    ];

    state = { ...state, ...buildReport(state) };
    yield ['updates', { build_report: { report: state.report } }];

    yield ['values', { output: state.report }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const sampleDoc =
    'LangGraph makes it easy to build stateful, multi-actor applications with LLMs. ' +
    'The framework provides first-class support for persistence, streaming, and human-in-the-loop ' +
    'workflows. Developers love its flexibility and the ability to compose complex pipelines ' +
    'using simple Python functions.';

  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(graph, sampleDoc);
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
