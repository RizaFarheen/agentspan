/**
 * OpenAI Agent with Model Settings -- temperature, max tokens, and more.
 *
 * Demonstrates:
 *   - Configuring ModelSettings for fine-tuned LLM behavior
 *   - Low temperature for deterministic responses
 *   - High temperature for creative responses
 *   - Max tokens limit
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Creative agent with high temperature
const creativeAgent = {
  run: async (prompt: string) => ({ output: `Creative: ${prompt}` }),
  tools: [],
  model: llmModel,
  name: 'creative_writer',
  instructions:
    'You are a creative writing assistant. Write with vivid imagery ' +
    'and unexpected metaphors. Be bold and imaginative.',
  model_settings: {
    temperature: 0.9,
    max_tokens: 500,
  },
  _openai_agent: true,
};

// Precise agent with low temperature
const preciseAgent = {
  run: async (prompt: string) => ({ output: `Precise: ${prompt}` }),
  tools: [],
  model: llmModel,
  name: 'code_reviewer',
  instructions:
    'You are a precise code reviewer. Analyze code snippets for bugs, ' +
    'security issues, and best practices. Be concise and specific.',
  model_settings: {
    temperature: 0.1,
    max_tokens: 300,
  },
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  console.log('=== Creative Agent (temp=0.9) ===');
  const result1 = await runtime.run(
    creativeAgent,
    'Write a two-sentence story about a robot learning to paint.',
  );
  result1.printResult();

  console.log('\n=== Precise Agent (temp=0.1) ===');
  const result2 = await runtime.run(
    preciseAgent,
    'Review this Python code: `data = eval(user_input)`',
  );
  result2.printResult();
} finally {
  await runtime.shutdown();
}
