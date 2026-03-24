/**
 * Basic OpenAI Agent -- simplest possible agent with no tools.
 *
 * Demonstrates:
 *   - Defining an agent using the OpenAI Agents SDK mock
 *   - Running it on the Conductor agent runtime (auto-detected)
 *   - The runtime serializes the agent generically and the server
 *     normalizes the OpenAI-specific config into a Conductor workflow.
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Mock OpenAI Agent -- duck-typing detection: has .run() + .tools + .model
const agent = {
  run: async (prompt: string) => ({ output: `Greeted: ${prompt}` }),
  tools: [],
  model: llmModel,
  name: 'greeter',
  instructions: 'You are a friendly assistant. Keep your responses concise and helpful.',
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Say hello and tell me a fun fact about the Python programming language.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
