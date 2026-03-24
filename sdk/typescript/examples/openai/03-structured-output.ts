// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * OpenAI Agent with Structured Output -- enforced JSON schema response.
 *
 * Demonstrates:
 *   - Using outputType with a zod schema for structured responses
 *   - The agent is forced to return data matching the schema
 *   - Model settings (temperature) for deterministic output
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import { Agent, run, setTracingDisabled } from '@openai/agents';
import { z } from 'zod';
import { AgentRuntime } from '@agentspan/sdk';

setTracingDisabled(true);

// ── Structured output schema ────────────────────────────────────────

const MovieRecommendation = z.object({
  title: z.string(),
  year: z.number(),
  genre: z.string(),
  reason: z.string(),
});

const MovieList = z.object({
  recommendations: z.array(MovieRecommendation),
  theme: z.string(),
});

// ── Agent ───────────────────────────────────────────────────────────

const agent = new Agent({
  name: 'movie_recommender',
  instructions:
    'You are a movie recommendation expert. When asked for movie suggestions, ' +
    'return a structured list of recommendations with title, year, genre, ' +
    'and a brief reason for each recommendation. Identify the overall theme.',
  model: 'gpt-4o-mini',
  outputType: MovieList,
  modelSettings: {
    temperature: 0.3,
    maxTokens: 1000,
  },
});

const prompt = 'Recommend 3 sci-fi movies that explore the concept of artificial intelligence.';

// ── Path 1: Native OpenAI Agents SDK execution ─────────────────────
console.log('=== Path 1: Native OpenAI Agents SDK ===\n');
try {
  const nativeResult = await run(agent, prompt);
  const output = nativeResult.finalOutput;
  console.log('Native output (structured):');
  console.log(JSON.stringify(output, null, 2));
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
