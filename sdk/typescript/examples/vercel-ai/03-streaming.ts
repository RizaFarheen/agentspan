/**
 * Vercel AI SDK -- Streaming
 *
 * Demonstrates streaming tokens from a Vercel AI SDK agent
 * via the agentspan passthrough.
 */

import { streamText, generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── Tools ────────────────────────────────────────────────
const weatherTool = tool({
  description: 'Get current weather for a city',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => ({
    city,
    tempF: 62,
    condition: 'Foggy',
  }),
});

const tools = { weather: weatherTool };
const prompt = 'Explain quantum computing in one paragraph, then tell me the weather in San Francisco.';
const system = 'You are a helpful assistant. Use tools when relevant.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'streaming_agent',
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
    // Real streaming via streamText for the duck-typed wrapper
    const result = streamText({
      model,
      system,
      prompt: opts.prompt,
      tools,
      maxSteps: 3,
    });
    for await (const chunk of result.textStream) {
      yield { type: 'text-delta' as const, textDelta: chunk };
    }
    yield { type: 'finish' as const, finishReason: 'stop' as const };
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
