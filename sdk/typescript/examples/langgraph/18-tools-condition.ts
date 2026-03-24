/**
 * tools_condition -- StateGraph using prebuilt tools_condition for ReAct routing.
 *
 * Demonstrates:
 *   - Building a ReAct loop using toolsCondition from @langchain/langgraph/prebuilt
 *   - toolsCondition returns "tools" if the last message has tool_calls, else END
 *   - Practical use: a weather and timezone information agent
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
 *   builder.addConditionalEdges("agent", toolsCondition);
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
const weatherDb: Record<string, string> = {
  london: 'Cloudy, 12C, 80% humidity, light drizzle',
  'new york': 'Sunny, 22C, 55% humidity, clear skies',
  tokyo: 'Partly cloudy, 18C, 65% humidity, mild breeze',
  sydney: 'Warm and sunny, 28C, 45% humidity',
  paris: 'Overcast, 9C, 85% humidity, foggy morning',
};

const timezoneDb: Record<string, string> = {
  london: 'GMT+0 (BST+1 in summer) -- Europe/London',
  'new york': 'UTC-5 (EDT-4 in summer) -- America/New_York',
  tokyo: 'UTC+9 -- Asia/Tokyo',
  sydney: 'UTC+10 (AEDT+11 in summer) -- Australia/Sydney',
  paris: 'UTC+1 (CEST+2 in summer) -- Europe/Paris',
};

function getWeather(city: string): string {
  return weatherDb[city.toLowerCase()] ?? `Weather data unavailable for ${city}.`;
}

function getTimezone(city: string): string {
  return timezoneDb[city.toLowerCase()] ?? `Timezone data unavailable for ${city}.`;
}

// ---------------------------------------------------------------------------
// Mock compiled graph (simulates agent + ToolNode + toolsCondition loop)
// ---------------------------------------------------------------------------
const graph = {
  name: 'weather_timezone_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const tokyoWeather = getWeather('tokyo');
    const londonWeather = getWeather('london');
    const tokyoTz = getTimezone('tokyo');
    const londonTz = getTimezone('london');

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'get_weather', args: { city: 'Tokyo' } },
            { name: 'get_weather', args: { city: 'London' } },
            { name: 'get_timezone', args: { city: 'Tokyo' } },
            { name: 'get_timezone', args: { city: 'London' } },
          ],
        },
        { role: 'tool', name: 'get_weather', content: tokyoWeather },
        { role: 'tool', name: 'get_weather', content: londonWeather },
        { role: 'tool', name: 'get_timezone', content: tokyoTz },
        { role: 'tool', name: 'get_timezone', content: londonTz },
        {
          role: 'assistant',
          content:
            `Tokyo: ${tokyoWeather}. Timezone: ${tokyoTz}.\n` +
            `London: ${londonWeather}. Timezone: ${londonTz}.`,
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['agent', {}],
      ['tools', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'agent'],
      ['agent', 'tools'],
      ['tools', 'agent'],
      ['agent', '__end__'],
    ],
  }),

  nodes: new Map([
    ['agent', {}],
    ['tools', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const state = await graph.invoke(input);
    yield ['updates', { agent: { messages: [state.messages[0]] } }];
    yield ['updates', { tools: { messages: state.messages.slice(1, 5) } }];
    yield ['updates', { agent: { messages: [state.messages[5]] } }];
    yield ['values', state];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      graph,
      "What's the weather like in Tokyo and London? Also what timezone are they in?",
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
