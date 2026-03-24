/**
 * Multi-Tool Agent -- agent with diverse tool categories.
 *
 * Demonstrates:
 *   - Combining tools from different domains: time, currency, weather, distance
 *   - Agent correctly selects and chains tool calls
 *   - Tools returning realistic formatted data
 *   - Practical use case: travel planning assistant
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

const timezones: Record<string, [string, number]> = {
  'new york': ['UTC-5 (EST)', -5],
  london: ['UTC+0 (GMT)', 0],
  paris: ['UTC+1 (CET)', 1],
  tokyo: ['UTC+9 (JST)', 9],
  sydney: ['UTC+11 (AEDT)', 11],
  dubai: ['UTC+4 (GST)', 4],
  'los angeles': ['UTC-8 (PST)', -8],
};

function getLocalTime(city: string): string {
  const key = city.toLowerCase().trim();
  const [label, offset] = timezones[key] ?? ['UTC', 0];
  const utcNow = new Date();
  const local = new Date(utcNow.getTime() + offset * 3600 * 1000);
  const hours = local.getUTCHours().toString().padStart(2, '0');
  const mins = local.getUTCMinutes().toString().padStart(2, '0');
  return `${city}: ${hours}:${mins} (${label})`;
}

const ratesToUsd: Record<string, number> = {
  usd: 1.0, eur: 1.08, gbp: 1.26, jpy: 0.0067,
  aud: 0.64, cad: 0.74, chf: 1.11, inr: 0.012,
};

function convertCurrency(amount: number, from: string, to: string): string {
  const fromRate = ratesToUsd[from.toLowerCase()];
  const toRate = ratesToUsd[to.toLowerCase()];
  if (!fromRate || !toRate) {
    return `Currency conversion not supported for ${from}/${to}`;
  }
  const result = (amount * fromRate) / toRate;
  return `${amount} ${from.toUpperCase()} ~ ${result.toFixed(2)} ${to.toUpperCase()}`;
}

const flightDurations: Record<string, string> = {
  'new york->london': '7h 30m',
  'london->new york': '8h 00m',
  'london->tokyo': '11h 45m',
  'tokyo->london': '12h 15m',
  'new york->los angeles': '5h 30m',
  'los angeles->tokyo': '11h 00m',
  'paris->new york': '8h 10m',
  'dubai->london': '7h 10m',
};

function getFlightDuration(from: string, to: string): string {
  const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
  const revKey = `${to.toLowerCase()}->${from.toLowerCase()}`;
  const duration = flightDurations[key] ?? flightDurations[revKey];
  if (duration) {
    return `Flight from ${from} to ${to}: approximately ${duration}`;
  }
  return `No direct flight data available for ${from} to ${to}`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    const parts: string[] = [];

    if (query.includes('time') && query.includes('tokyo')) {
      parts.push(getLocalTime('Tokyo'));
    }
    if (query.includes('flight') || (query.includes('new york') && query.includes('tokyo'))) {
      parts.push(getFlightDuration('New York', 'Tokyo'));
    }
    if (query.includes('usd') || (query.includes('500') && query.includes('jpy'))) {
      parts.push(convertCurrency(500, 'USD', 'JPY'));
    }

    const output = parts.length > 0
      ? `Travel information:\n${parts.join('\n')}`
      : 'Please ask about local times, flights, or currency conversion.';

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running multi-tool travel assistant via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    "I'm an American planning to travel from New York to Tokyo. " +
      'What time is it there right now, how long is the flight, ' +
      'and how much is 500 USD in JPY?',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
