/**
 * Vercel AI SDK -- Structured Output
 *
 * Demonstrates generating typed structured output using generateObject()
 * via the agentspan passthrough.
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── Schema ───────────────────────────────────────────────
const PersonSchema = z.object({
  name: z.string().describe('Full name'),
  age: z.number().int().describe('Age in years'),
  occupation: z.string().describe('Current job title'),
  skills: z.array(z.string()).describe('Top 3 skills'),
});

type Person = z.infer<typeof PersonSchema>;

const prompt = 'Generate a profile for a fictional ML engineer from Japan.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'structured_output_agent',
  tools: {},
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    const result = await generateObject({
      model,
      schema: PersonSchema,
      prompt: opts.prompt,
    });
    const validated: Person = PersonSchema.parse(result.object);
    return {
      text: JSON.stringify(validated, null, 2),
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop' as const,
      experimental_output: validated,
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
