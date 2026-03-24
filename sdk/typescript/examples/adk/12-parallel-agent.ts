/**
 * Parallel Agent -- ParallelAgent runs sub-agents concurrently.
 *
 * Mirrors the pattern from Google ADK samples (story_teller, parallel_task_decomposition).
 * All sub-agents run in parallel and their results are aggregated.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Three analysts run in parallel
const marketAnalyst = {
  run: async (prompt: string) => ({ output: `Market: ${prompt}` }),
  model: llmModel,
  name: 'market_analyst',
  description: 'Analyzes market trends.',
  instruction:
    'You are a market analyst. Given the company or product topic, ' +
    'provide a brief 2-3 sentence market analysis. Focus on trends and competition.',
  _google_adk: true,
};

const techAnalyst = {
  run: async (prompt: string) => ({ output: `Tech: ${prompt}` }),
  model: llmModel,
  name: 'tech_analyst',
  description: 'Evaluates technology aspects.',
  instruction:
    'You are a technology analyst. Given the company or product topic, ' +
    'provide a brief 2-3 sentence technical evaluation. Focus on innovation and capabilities.',
  _google_adk: true,
};

const riskAnalyst = {
  run: async (prompt: string) => ({ output: `Risk: ${prompt}` }),
  model: llmModel,
  name: 'risk_analyst',
  description: 'Assesses risks.',
  instruction:
    'You are a risk analyst. Given the company or product topic, ' +
    'provide a brief 2-3 sentence risk assessment. Focus on potential challenges.',
  _google_adk: true,
};

// All three run in parallel (ParallelAgent mock)
const parallelAnalysis = {
  run: async (prompt: string) => ({ output: `Parallel: ${prompt}` }),
  model: llmModel,
  name: 'parallel_analysis',
  sub_agents: [marketAnalyst, techAnalyst, riskAnalyst],
  _adk_parallel: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    parallelAnalysis,
    "Analyze Tesla's electric vehicle business",
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
