/**
 * Vercel AI SDK -- Passthrough
 *
 * Demonstrates passing a Vercel AI SDK agent to runtime.run().
 * The SDK auto-detects the framework via duck-typing (.generate, .stream, .tools)
 * and uses the passthrough worker pattern.
 */

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── Tools ────────────────────────────────────────────────
const weatherTool = tool({
  description: 'Get current weather for a city',
  parameters: z.object({ city: z.string().describe('City name') }),
  execute: async ({ city }) => ({
    city,
    tempF: 62,
    condition: 'Foggy',
  }),
});

const tools = { weather: weatherTool };

// ── Prompt ───────────────────────────────────────────────
const prompt = 'What is the weather in San Francisco?';
const system = 'You are a helpful assistant. Use available tools to answer questions.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'weather_agent',
  tools,
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    const result = await generateText({
      model,
      system,
      prompt: opts.prompt,
      tools,
      maxSteps: 3,
      onStepFinish: opts.onStepFinish,
    });
    return {
      text: result.text,
      toolCalls: result.steps.flatMap(s => s.toolCalls),
      toolResults: result.steps.flatMap(s => s.toolResults),
      finishReason: result.finishReason,
    };
  },
  stream: async function* (opts: { prompt: string }) {
    // Not used in this example but required for duck-typing detection
    yield { type: 'finish' as const };
  },
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
