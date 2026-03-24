/**
 * Vercel AI SDK -- Tool Compatibility
 *
 * Demonstrates mixing Vercel AI SDK tool() with agentspan native tool()
 * in the same agent. Both tool formats share the same shape (Zod parameters
 * + execute function) so they can co-exist in a single tool set.
 */

import { generateText, tool as aiTool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  AgentRuntime,
  tool as agentspanTool,
  getToolDef,
} from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── Agentspan native tool ────────────────────────────────
const nativeSearchTool = agentspanTool(
  async (args: { query: string }) => ({
    results: [`Result for: ${args.query}`],
  }),
  {
    name: 'native_search',
    description: 'Search using agentspan native tool format.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
  },
);

// ── Vercel AI SDK tool ───────────────────────────────────
const calculatorTool = aiTool({
  description: 'Evaluate a simple math expression.',
  parameters: z.object({
    expression: z.string().describe('Math expression to evaluate'),
  }),
  execute: async ({ expression }) => {
    try {
      // Safe eval for simple expressions
      const result = Function(`"use strict"; return (${expression})`)();
      return { expression, result: String(result) };
    } catch {
      return { expression, result: 'Error: could not evaluate' };
    }
  },
});

// ── Show normalized tool definitions ─────────────────────
console.log('Native tool def:', getToolDef(nativeSearchTool).name);
console.log('Vercel tool def:', JSON.stringify(getToolDef(calculatorTool)));

// ── Combined tool set (Vercel AI format) ─────────────────
const tools = {
  native_search: aiTool({
    description: 'Search using native agentspan tool format.',
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ results: [`Result for: ${query}`] }),
  }),
  calculator: calculatorTool,
};

const prompt = 'Search for quantum computing and also calculate 2 + 2.';
const system = 'You are a helpful assistant. Use the available tools to answer.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'mixed_tools_agent',
  tools,
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    const result = await generateText({
      model,
      system,
      prompt: opts.prompt,
      tools,
      maxSteps: 5,
      onStepFinish: opts.onStepFinish,
    });
    return {
      text: result.text,
      toolCalls: result.steps.flatMap(s => s.toolCalls),
      toolResults: result.steps.flatMap(s => s.toolResults),
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
