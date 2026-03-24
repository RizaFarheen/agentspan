// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * OpenAI Agent with Function Tools -- tool calling via the `tool()` helper.
 *
 * Demonstrates:
 *   - Defining function tools with zod schemas
 *   - Multiple tools with typed parameters
 *   - Running natively and via Agentspan passthrough
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import { Agent, run, tool, setTracingDisabled } from '@openai/agents';
import { z } from 'zod';
import { AgentRuntime } from '@agentspan/sdk';

setTracingDisabled(true);

// ── Tools ───────────────────────────────────────────────────────────

const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: z.object({ city: z.string().describe('City name') }),
  execute: async ({ city }) => {
    const weatherData: Record<string, string> = {
      'new york': '72F, Partly Cloudy',
      'san francisco': '58F, Foggy',
      miami: '85F, Sunny',
      london: '55F, Rainy',
    };
    return weatherData[city.toLowerCase()] ?? `Weather data not available for ${city}`;
  },
});

const calculate = tool({
  name: 'calculate',
  description: 'Evaluate a mathematical expression and return the result.',
  parameters: z.object({ expression: z.string().describe('Math expression to evaluate') }),
  execute: async ({ expression }) => {
    try {
      // Simple safe eval for basic math
      const sanitized = expression.replace(/[^0-9+\-*/().sqrt,pow ]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      return String(result);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  },
});

const lookupPopulation = tool({
  name: 'lookup_population',
  description: 'Look up the population of a city.',
  parameters: z.object({ city: z.string().describe('City name') }),
  execute: async ({ city }) => {
    const populations: Record<string, string> = {
      'new york': '8.3 million',
      'san francisco': '874,000',
      miami: '442,000',
      london: '8.8 million',
    };
    return populations[city.toLowerCase()] ?? 'Unknown';
  },
});

// ── Agent ───────────────────────────────────────────────────────────

const agent = new Agent({
  name: 'multi_tool_agent',
  instructions:
    'You are a helpful assistant with access to weather, calculator, ' +
    'and population lookup tools. Use them to answer questions accurately.',
  model: 'gpt-4o-mini',
  tools: [getWeather, calculate, lookupPopulation],
});

const prompt =
  "What's the weather in San Francisco? Also, what's the population there " +
  "and what's the square root of that number (just the digits)?";

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
