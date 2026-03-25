/**
 * Basic Agent — 5-line hello world.
 *
 * Demonstrates the simplest possible agent: a single LLM with no tools.
 *
 * Requirements:
 *   - Conductor server with LLM support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { Agent, AgentRuntime } from '../src/index.js';
import { llmModel } from './settings.js';

const agent = new Agent({ name: 'greeter', model: llmModel });

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Say hello and tell me a fun fact about Python programming.',
  );
  console.log(`agent completed with status: ${result.status}`);
  result.printResult();
} finally {
  await runtime.shutdown();
}
