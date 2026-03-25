/**
 * Minimal Google ADK Greeting Agent.
 *
 * The simplest possible ADK agent: no tools, no structured output, one turn.
 * Used to verify the ADK integration works end-to-end.
 *
 * Requirements:
 *   - npm install @google/adk zod
 *   - AGENTSPAN_SERVER_URL for agentspan path
 */

import { LlmAgent } from '@google/adk';
import { AgentRuntime } from '../../src/index.js';

const model = process.env.AGENTSPAN_LLM_MODEL ?? 'gemini-2.5-flash';

const agent = new LlmAgent({
  name: 'greeter',
  model,
  instruction: 'You are a friendly greeter. Reply with a warm hello and one fun fact.',
});

// ── Run on agentspan ───────────────────────────────────────────────

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(agent, 'Say hello!');
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
