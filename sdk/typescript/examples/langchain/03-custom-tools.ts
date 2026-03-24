/**
 * Custom Tools -- advanced tool definitions with typed schemas.
 *
 * Demonstrates:
 *   - Tools with structured input schemas (unit conversion, formatting, percentage)
 *   - Tools that return structured data
 *   - Multiple tool types: lookup, compute, format
 *   - How LangChain validates tool inputs before calling
 *
 * In production you would use:
 *   import { tool, StructuredTool } from '@langchain/core/tools';
 *   import { z } from 'zod';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function convertUnits(value: number, fromUnit: string, toUnit: string): string {
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  const conversions: Record<string, (v: number) => number> = {
    'km->miles': (v) => v * 0.621371,
    'miles->km': (v) => v * 1.60934,
    'kg->lbs': (v) => v * 2.20462,
    'lbs->kg': (v) => v * 0.453592,
    'celsius->fahrenheit': (v) => v * 9 / 5 + 32,
    'fahrenheit->celsius': (v) => (v - 32) * 5 / 9,
    'meters->feet': (v) => v * 3.28084,
    'feet->meters': (v) => v * 0.3048,
  };

  const key = `${from}->${to}`;
  const fn = conversions[key];
  if (fn) {
    const result = fn(value);
    return `${value} ${from} = ${result.toFixed(4)} ${to}`;
  }
  return `Conversion from ${from} to ${to} is not supported.`;
}

function formatNumber(num: number, decimalPlaces = 2, useComma = true): string {
  const formatted = useComma
    ? num.toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
    : num.toFixed(decimalPlaces);
  return `Formatted: ${formatted}`;
}

function percentage(part: number, whole: number): string {
  if (whole === 0) return "Error: 'whole' cannot be zero.";
  const pct = (part / whole) * 100;
  return `${part} is ${pct.toFixed(2)}% of ${whole}`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    let output: string;

    if (query.includes('convert') && query.includes('km')) {
      output = convertUnits(100, 'km', 'miles');
    } else if (query.includes('format') && query.includes('number')) {
      output = formatNumber(1234567.891, 3);
    } else if (query.includes('percentage') || query.includes('%')) {
      output = percentage(37, 185);
    } else {
      output = 'Please ask about unit conversion, number formatting, or percentages.';
    }

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const queries = [
    'Convert 100 km to miles.',
    'Format the number 1234567.891 with 3 decimal places.',
    'What percentage is 37 of 185?',
  ];

  for (const query of queries) {
    console.log(`\nQ: ${query}`);
    const result = await runtime.run(langchainAgent, query);
    result.printResult();
  }

  await runtime.shutdown();
}

main().catch(console.error);
