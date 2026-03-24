/**
 * Basic Google ADK Agent -- simplest possible agent.
 *
 * Demonstrates:
 *   - Defining an agent using Google's Agent Development Kit (ADK)
 *   - Running it on the Conductor agent runtime (auto-detected)
 *   - The runtime serializes the agent generically and the server
 *     normalizes the ADK-specific config into a Conductor workflow.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

const agent = {
  run: async (prompt: string) => ({ output: `Greeted: ${prompt}` }),
  model: llmModel,
  name: 'greeter',
  instruction: 'You are a friendly assistant. Keep your responses concise and helpful.',
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Say hello and tell me a fun fact about machine learning.',
  );
  console.log(`agent completed with status: ${result.status}`);
  result.printResult();
} finally {
  await runtime.shutdown();
}
