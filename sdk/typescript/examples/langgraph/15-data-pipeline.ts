/**
 * Data Pipeline -- StateGraph with load -> clean -> analyze -> report nodes.
 *
 * Demonstrates:
 *   - A multi-step ETL-style pipeline modelled as a StateGraph
 *   - Each node transforms the state as data flows through
 *   - Using an LLM at the analysis and reporting stages
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface DataRow {
  [key: string]: unknown;
}

interface PipelineState {
  dataset_name: string;
  raw_data: DataRow[];
  clean_data: DataRow[];
  analysis: string;
  report: string;
}

// ---------------------------------------------------------------------------
// Mock datasets
// ---------------------------------------------------------------------------
const MOCK_DATASETS: Record<string, DataRow[]> = {
  sales: [
    { product: 'Widget A', revenue: 15000, units: 300, region: 'North' },
    { product: 'Widget B', revenue: null, units: 150, region: 'South' },
    { product: 'Widget C', revenue: 8000, units: -5, region: 'East' },
    { product: 'Widget D', revenue: 22000, units: 440, region: 'West' },
    { product: 'Widget E', revenue: 0, units: 0, region: 'North' },
  ],
  users: [
    { id: 1, name: 'Alice', age: 28, active: true },
    { id: 2, name: '', age: -1, active: false },
    { id: 3, name: 'Bob', age: 34, active: true },
  ],
};

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function loadData(state: PipelineState): Partial<PipelineState> {
  const dataset = MOCK_DATASETS[state.dataset_name.toLowerCase()] ?? MOCK_DATASETS['sales'];
  return { raw_data: dataset };
}

function cleanData(state: PipelineState): Partial<PipelineState> {
  const cleaned = state.raw_data.filter((row) => {
    if (row.revenue === null || row.revenue === undefined) return false;
    if (typeof row.units === 'number' && row.units < 0) return false;
    if (row.revenue === 0 && row.units === 0) return false;
    return true;
  });
  return { clean_data: cleaned };
}

function analyzeData(state: PipelineState): Partial<PipelineState> {
  const data = state.clean_data;
  const totalRevenue = data.reduce((sum, r) => sum + (r.revenue as number), 0);
  const totalUnits = data.reduce((sum, r) => sum + (r.units as number), 0);
  const avgRevenue = data.length > 0 ? totalRevenue / data.length : 0;

  const analysis =
    `Dataset: ${state.dataset_name}\n` +
    `Records after cleaning: ${data.length} (removed ${state.raw_data.length - data.length} invalid rows)\n` +
    `Total Revenue: $${totalRevenue.toLocaleString()}\n` +
    `Total Units Sold: ${totalUnits}\n` +
    `Average Revenue per Product: $${avgRevenue.toLocaleString()}\n` +
    `Top product: ${data.reduce((top, r) => ((r.revenue as number) > (top.revenue as number) ? r : top), data[0]).product}`;

  return { analysis };
}

function generateReport(state: PipelineState): Partial<PipelineState> {
  const report =
    `EXECUTIVE SUMMARY REPORT\n` +
    `========================\n\n` +
    `${state.analysis}\n\n` +
    `Recommendations:\n` +
    `- Focus on high-performing products (Widget D leads in revenue)\n` +
    `- Investigate data quality issues (${state.raw_data.length - state.clean_data.length} records had invalid data)\n` +
    `- Consider expanding in regions with strong unit sales`;

  return { report };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'data_pipeline',

  invoke: async (input: Record<string, unknown>) => {
    const datasetName = (input.input as string) ?? 'sales';
    let state: PipelineState = {
      dataset_name: datasetName,
      raw_data: [],
      clean_data: [],
      analysis: '',
      report: '',
    };

    state = { ...state, ...loadData(state) };
    state = { ...state, ...cleanData(state) };
    state = { ...state, ...analyzeData(state) };
    state = { ...state, ...generateReport(state) };

    return { output: state.report };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['load', {}],
      ['clean', {}],
      ['analyze', {}],
      ['report', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'load'],
      ['load', 'clean'],
      ['clean', 'analyze'],
      ['analyze', 'report'],
      ['report', '__end__'],
    ],
  }),

  nodes: new Map([
    ['load', {}],
    ['clean', {}],
    ['analyze', {}],
    ['report', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const datasetName = (input.input as string) ?? 'sales';
    let state: PipelineState = {
      dataset_name: datasetName,
      raw_data: [],
      clean_data: [],
      analysis: '',
      report: '',
    };

    state = { ...state, ...loadData(state) };
    yield ['updates', { load: { raw_data_count: state.raw_data.length } }];

    state = { ...state, ...cleanData(state) };
    yield ['updates', { clean: { clean_data_count: state.clean_data.length } }];

    state = { ...state, ...analyzeData(state) };
    yield ['updates', { analyze: { analysis: state.analysis } }];

    state = { ...state, ...generateReport(state) };
    yield ['updates', { report: { report: state.report } }];

    yield ['values', { output: state.report }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(graph, 'sales');
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
