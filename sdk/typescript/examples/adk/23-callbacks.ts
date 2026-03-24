/**
 * Google ADK Callbacks -- lifecycle hooks on agent execution.
 *
 * Demonstrates:
 *   - before_model_callback: runs before each LLM call
 *   - after_model_callback: runs after each LLM call
 *   - Callbacks are registered as Conductor worker tasks
 *
 * Requirements:
 *   - Conductor server with callback support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Callback functions ----------------------------------------------------

function logBeforeModel(callbackPosition: string, agentName: string): Record<string, unknown> {
  console.log(`[CALLBACK] Before model call for agent '${agentName}'`);
  return {};
}

function inspectAfterModel(callbackPosition: string, agentName: string, llmResult: string = ''): Record<string, unknown> {
  const wordCount = llmResult ? llmResult.split(/\s+/).length : 0;
  console.log(`[CALLBACK] After model call for '${agentName}': ${wordCount} words generated`);
  if (wordCount > 500) {
    console.log(`[CALLBACK] Warning: Response exceeds 500 words (${wordCount})`);
  }
  return {};
}

// -- Mock ADK Agent with callbacks ----------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Monitored: ${prompt}` }),
  model: llmModel, name: 'monitored_assistant',
  instruction:
    'You are a helpful assistant. Answer questions concisely. ' +
    'Keep responses under 200 words.',
  before_model_callback: logBeforeModel,
  after_model_callback: inspectAfterModel,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Explain the difference between supervised and unsupervised machine learning.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
