/**
 * Minimal Google ADK greeting agent -- for debugging the native runner.
 *
 * The simplest possible ADK agent: no tools, no structured output, one turn.
 * Used to verify the ADK native shim works end-to-end before testing more
 * complex examples.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Mock Google ADK Agent -- duck-typing: has .run() + .model + Google markers
const agent = {
  run: async (prompt: string) => ({ output: `Hello! ${prompt}` }),
  model: llmModel,
  name: 'greeter',
  instruction: 'You are a friendly greeter. Reply with a warm hello and one fun fact.',
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(agent, 'Say hello!');
  result.printResult();
} finally {
  await runtime.shutdown();
}
