/**
 * OpenAI Agent with Function Tools -- tool calling via function_tool.
 *
 * Demonstrates:
 *   - Using function tools with typed parameters
 *   - Multiple tools registered on a single agent
 *   - The Conductor runtime auto-extracts callables, registers them as
 *     workers, and the server normalizes function tools into worker tasks.
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Function tools --------------------------------------------------------

function getWeather(city: string): string {
  const weatherData: Record<string, string> = {
    'new york': '72 F, Partly Cloudy',
    'san francisco': '58 F, Foggy',
    miami: '85 F, Sunny',
    london: '55 F, Rainy',
  };
  return weatherData[city.toLowerCase()] ?? `Weather data not available for ${city}`;
}

function calculate(expression: string): string {
  const allowed = new Set('0123456789+-*/.(). '.split(''));
  if (![...expression].every((c) => allowed.has(c))) {
    return 'Error: invalid expression';
  }
  try {
    const fn = new Function(`return (${expression});`);
    return String(fn());
  } catch (e) {
    return `Error: ${e}`;
  }
}

function lookupPopulation(city: string): string {
  const populations: Record<string, string> = {
    'new york': '8.3 million',
    'san francisco': '874,000',
    miami: '442,000',
    london: '8.8 million',
  };
  return populations[city.toLowerCase()] ?? 'Unknown';
}

// -- Mock OpenAI Agent with tools ------------------------------------------

const functionTools = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    fn: getWeather,
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression and return the result.',
    fn: calculate,
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
  {
    name: 'lookup_population',
    description: 'Look up the population of a city.',
    fn: lookupPopulation,
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
];

const agent = {
  run: async (prompt: string) => ({ output: `Processed: ${prompt}` }),
  tools: functionTools,
  model: llmModel,
  name: 'multi_tool_agent',
  instructions:
    'You are a helpful assistant with access to weather, calculator, ' +
    'and population lookup tools. Use them to answer questions accurately.',
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "What's the weather in San Francisco? Also, what's the population there " +
      "and what's the square root of that number (just the digits)?",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
