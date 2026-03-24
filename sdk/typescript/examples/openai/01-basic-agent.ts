// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * Basic OpenAI Agent -- simplest possible agent with no tools.
 *
 * Demonstrates:
 *   - Defining an agent using the real @openai/agents SDK
 *   - Running it natively via `run()` from @openai/agents
 *   - Running it via Agentspan passthrough (AgentRuntime)
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import { Agent, run, setTracingDisabled } from '@openai/agents';
import { AgentRuntime } from '@agentspan/sdk';

// Disable OpenAI tracing for cleaner example output
setTracingDisabled(true);

const agent = new Agent({
  name: 'greeter',
  instructions: 'You are a friendly assistant. Keep your responses concise and helpful.',
  model: 'gpt-4o-mini',
});

const prompt = 'Say hello and tell me a fun fact about the TypeScript programming language.';

// ── Path 1: Native OpenAI Agents SDK execution ─────────────────────
console.log('=== Path 1: Native OpenAI Agents SDK ===\n');
try {
  const nativeResult = await run(agent, prompt);
  console.log('Native output:', nativeResult.finalOutput);
} catch (err: any) {
  console.log('Native path error (need OPENAI_API_KEY):', err.message);
}

// ── Path 2: Agentspan passthrough ──────────────────────────────────
console.log('\n=== Path 2: Agentspan Passthrough ===\n');
const runtime = new AgentRuntime();
try {
  const agentspanResult = await runtime.run(agent, prompt);
  console.log('Agentspan output:', agentspanResult.output);
} catch (err: any) {
  console.log('Agentspan path error (need AGENTSPAN_SERVER_URL):', err.message);
} finally {
  await runtime.shutdown();
}
