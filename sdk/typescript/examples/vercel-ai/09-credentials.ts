/**
 * Vercel AI SDK -- Credential Passthrough
 *
 * Demonstrates passing credentials (API keys) through Agentspan
 * to a Vercel AI SDK agent. The Vercel AI SDK uses the OPENAI_API_KEY
 * environment variable natively; Agentspan's credential system can
 * resolve and inject keys transparently.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

const prompt = 'Summarize the latest research on transformer architectures in 2-3 sentences.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
// In production, agentspan resolves the API key from its credential
// store and injects it into the environment before the agent runs.
const vercelAgent = {
  id: 'credentialed_agent',
  tools: {},
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    // The Vercel AI SDK reads OPENAI_API_KEY from the environment.
    // In production, agentspan would have already injected it.
    const result = await generateText({
      model,
      prompt: opts.prompt,
    });
    return {
      text: result.text,
      toolCalls: [],
      toolResults: [],
      finishReason: result.finishReason,
    };
  },
  stream: async function* () { yield { type: 'finish' as const }; },
};

// ── Run on agentspan ─────────────────────────────────────
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(vercelAgent, prompt);
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
