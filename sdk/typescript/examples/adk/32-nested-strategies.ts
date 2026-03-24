/**
 * Google ADK Nested Strategies -- ParallelAgent inside SequentialAgent.
 *
 * Demonstrates composing agent strategies: parallel research runs
 * concurrently, then results flow into a sequential summarizer.
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Parallel research agents ----------------------------------------------

const marketAnalyst = {
  run: async (prompt: string) => ({ output: `Market: ${prompt}` }),
  model: llmModel, name: 'market_analyst',
  instruction:
    'You are a market analyst. Analyze the market size, growth rate, ' +
    'and key players for the given topic. Be concise (3-4 bullet points).',
  _google_adk: true,
};

const riskAnalyst = {
  run: async (prompt: string) => ({ output: `Risk: ${prompt}` }),
  model: llmModel, name: 'risk_analyst',
  instruction:
    'You are a risk analyst. Identify the top 3 risks: regulatory, ' +
    'technical, and competitive. Be concise.',
  _google_adk: true,
};

// Both run concurrently (ParallelAgent mock)
const parallelResearch = {
  run: async (prompt: string) => ({ output: `Research: ${prompt}` }),
  model: llmModel, name: 'research_phase',
  sub_agents: [marketAnalyst, riskAnalyst],
  _adk_parallel: true,
  _google_adk: true,
};

// -- Summarizer ------------------------------------------------------------

const summarizer = {
  run: async (prompt: string) => ({ output: `Summary: ${prompt}` }),
  model: llmModel, name: 'summarizer',
  instruction:
    'You are an executive briefing writer. Synthesize the market analysis ' +
    'and risk assessment into a concise executive summary (1 paragraph).',
  _google_adk: true,
};

// -- Pipeline: parallel -> sequential --------------------------------------

const pipeline = {
  run: async (prompt: string) => ({ output: `Pipeline: ${prompt}` }),
  model: llmModel, name: 'analysis_pipeline',
  sub_agents: [parallelResearch, summarizer],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    pipeline,
    'Launching an AI-powered healthcare diagnostics tool in the US',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
