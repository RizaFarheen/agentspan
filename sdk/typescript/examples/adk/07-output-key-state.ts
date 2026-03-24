/**
 * Google ADK Agent with Output Key -- state management via output_key.
 *
 * Demonstrates:
 *   - Using output_key to store agent responses in session state
 *   - Multiple agents that pass data through shared state
 *   - Coordinator delegates to sub-agents with different responsibilities
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function analyzeData(dataset: string): Record<string, unknown> {
  const datasets: Record<string, Record<string, string>> = {
    sales_q4: {
      total_revenue: '$2.3M',
      growth_rate: '12%',
      top_product: 'Widget Pro',
      avg_order_value: '$156',
    },
    user_engagement: {
      daily_active_users: '45,000',
      avg_session_duration: '8.5 min',
      retention_rate: '72%',
      churn_rate: '5.2%',
    },
  };
  return datasets[dataset.toLowerCase()] ?? { error: `Dataset '${dataset}' not found` };
}

function generateChartDescription(metric: string, value: string): Record<string, unknown> {
  return {
    chart_type: value.includes('%') ? 'gauge' : 'bar',
    metric,
    value,
    recommendation: `Track ${metric} weekly for trend analysis.`,
  };
}

// -- Sub-agents ------------------------------------------------------------

const analyst = {
  run: async (prompt: string) => ({ output: `Analysis: ${prompt}` }),
  model: llmModel,
  name: 'data_analyst',
  instruction:
    'You are a data analyst. Use the analyze_data tool to examine datasets. ' +
    'Provide a clear summary of the key findings.',
  tools: [
    {
      name: 'analyze_data',
      description: 'Analyze a dataset and return key statistics.',
      fn: analyzeData,
      parameters: {
        type: 'object',
        properties: { dataset: { type: 'string' } },
        required: ['dataset'],
      },
    },
  ],
  output_key: 'analysis_results',
  _google_adk: true,
};

const visualizer = {
  run: async (prompt: string) => ({ output: `Charts: ${prompt}` }),
  model: llmModel,
  name: 'chart_designer',
  instruction:
    'You are a data visualization expert. Based on the analysis results, ' +
    'suggest appropriate visualizations. Use the generate_chart_description ' +
    'tool for each key metric.',
  tools: [
    {
      name: 'generate_chart_description',
      description: 'Generate a description for a chart visualization.',
      fn: generateChartDescription,
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['metric', 'value'],
      },
    },
  ],
  _google_adk: true,
};

// -- Coordinator -----------------------------------------------------------

const coordinator = {
  run: async (prompt: string) => ({ output: `Report: ${prompt}` }),
  model: llmModel,
  name: 'report_coordinator',
  instruction:
    'You are a report coordinator. First, have the data analyst examine ' +
    'the requested dataset. Then, have the chart designer suggest ' +
    'visualizations. Provide a final executive summary.',
  sub_agents: [analyst, visualizer],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    'Create a report on the sales_q4 dataset with visualization recommendations.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
