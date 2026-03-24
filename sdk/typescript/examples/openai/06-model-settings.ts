// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * OpenAI Agent with Model Settings -- temperature, max tokens, and more.
 *
 * Demonstrates:
 *   - Configuring model settings for fine-tuned LLM behavior
 *   - Low temperature for deterministic responses
 *   - High temperature for creative responses
 *   - Max tokens limit
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import { Agent, run, setTracingDisabled } from '@openai/agents';
import { AgentRuntime } from '@agentspan/sdk';

setTracingDisabled(true);

// ── Creative agent with high temperature ────────────────────────────

const creativeAgent = new Agent({
  name: 'creative_writer',
  instructions:
    'You are a creative writing assistant. Write with vivid imagery ' +
    'and unexpected metaphors. Be bold and imaginative.',
  model: 'gpt-4o-mini',
  modelSettings: {
    temperature: 0.9,
    maxTokens: 500,
  },
});

// ── Precise agent with low temperature ──────────────────────────────

const preciseAgent = new Agent({
  name: 'code_reviewer',
  instructions:
    'You are a precise code reviewer. Analyze code snippets for bugs, ' +
    'security issues, and best practices. Be concise and specific.',
  model: 'gpt-4o-mini',
  modelSettings: {
    temperature: 0.1,
    maxTokens: 300,
  },
});

// ── Path 1: Native OpenAI Agents SDK execution ─────────────────────
console.log('=== Path 1: Native OpenAI Agents SDK ===\n');

console.log('--- Creative Agent (temp=0.9) ---');
try {
  const creativeResult = await run(
    creativeAgent,
    'Write a two-sentence story about a robot learning to paint.',
  );
  console.log('Creative output:', creativeResult.finalOutput);
} catch (err: any) {
  console.log('Native path error (need OPENAI_API_KEY):', err.message);
}

console.log('\n--- Precise Agent (temp=0.1) ---');
try {
  const preciseResult = await run(
    preciseAgent,
    'Review this Python code: `data = eval(user_input)`',
  );
  console.log('Precise output:', preciseResult.finalOutput);
} catch (err: any) {
  console.log('Native path error (need OPENAI_API_KEY):', err.message);
}

// ── Path 2: Agentspan passthrough ──────────────────────────────────
console.log('\n=== Path 2: Agentspan Passthrough ===\n');
const runtime = new AgentRuntime();
try {
  console.log('--- Creative Agent ---');
  const creativeAgentspanResult = await runtime.run(
    creativeAgent,
    'Write a two-sentence story about a robot learning to paint.',
  );
  console.log('Agentspan output:', creativeAgentspanResult.output);

  console.log('\n--- Precise Agent ---');
  const preciseAgentspanResult = await runtime.run(
    preciseAgent,
    'Review this Python code: `data = eval(user_input)`',
  );
  console.log('Agentspan output:', preciseAgentspanResult.output);
} catch (err: any) {
  console.log('Agentspan path error (need AGENTSPAN_SERVER_URL):', err.message);
} finally {
  await runtime.shutdown();
}
