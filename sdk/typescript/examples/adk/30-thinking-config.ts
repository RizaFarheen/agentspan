/**
 * Google ADK Thinking Config -- extended reasoning for complex tasks.
 *
 * Uses ADK's ThinkingConfig to enable extended thinking mode,
 * allowing the LLM to reason step-by-step before responding.
 *
 * Requirements:
 *   - Conductor server with thinking config support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tool ------------------------------------------------------------------

function calculate(expression: string): Record<string, unknown> {
  try {
    const allowed = new Set('0123456789+-*/.(). '.split(''));
    if (![...expression].every((c) => allowed.has(c))) {
      return { expression, error: 'Invalid expression' };
    }
    const fn = new Function(`return (${expression});`);
    return { expression, result: fn() };
  } catch (e) {
    return { expression, error: String(e) };
  }
}

// -- Mock ADK Agent with thinking config ----------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Think: ${prompt}` }),
  model: llmModel, name: 'deep_thinker',
  instruction:
    'You are an analytical assistant. Think carefully through complex ' +
    'problems step by step. Use the calculate tool for math.',
  tools: [
    { name: 'calculate', description: 'Evaluate a mathematical expression.', fn: calculate, parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
  ],
  generate_content_config: {
    thinking_config: { thinking_budget: 2048 },
  },
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'If a train travels 120 km in 2 hours, then speeds up by 50% for ' +
      'the next 3 hours, what is the total distance traveled?',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
