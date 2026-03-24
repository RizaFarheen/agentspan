/**
 * Vercel AI SDK -- Stop Conditions
 *
 * Demonstrates controlling when a multi-step agent stops:
 * - maxSteps: Hard limit on number of LLM calls
 * - Tool-based termination: Agent stops after getting enough data
 */

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── Tools ────────────────────────────────────────────────
let analysisStepCount = 0;

const analyzeStep = tool({
  description: 'Perform one step of data analysis. Returns partial results.',
  parameters: z.object({
    aspect: z.string().describe('What aspect to analyze'),
  }),
  execute: async ({ aspect }) => {
    analysisStepCount++;
    return {
      aspect,
      finding: `Analysis of "${aspect}": trend is positive (step ${analysisStepCount})`,
      complete: analysisStepCount >= 3,
    };
  },
});

const summarize = tool({
  description: 'Summarize all analysis findings into a final report.',
  parameters: z.object({
    findings: z.array(z.string()).describe('List of findings to summarize'),
  }),
  execute: async ({ findings }) => ({
    summary: `Final report based on ${findings.length} findings.`,
    conclusion: 'Overall trend is positive across all analyzed aspects.',
  }),
});

const tools = { analyzeStep, summarize };
const prompt = 'Analyze market trends for AI infrastructure companies. Look at revenue growth, adoption rates, and competitive landscape, then summarize.';
const system = 'You are a market analyst. Analyze each aspect one at a time using the analyzeStep tool, then summarize all findings. Do not analyze more than 3 aspects.';

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'stop_conditions_agent',
  tools,
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    analysisStepCount = 0;
    const result = await generateText({
      model,
      system,
      prompt: opts.prompt,
      tools,
      maxSteps: 8,
      onStepFinish: opts.onStepFinish,
    });
    return {
      text: result.text,
      toolCalls: result.steps.flatMap(s => s.toolCalls),
      toolResults: result.steps.flatMap(s => s.toolResults),
      finishReason: result.finishReason,
      usage: result.usage,
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
