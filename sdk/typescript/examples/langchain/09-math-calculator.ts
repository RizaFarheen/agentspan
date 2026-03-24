/**
 * Math Calculator -- agent with comprehensive mathematical tools.
 *
 * Demonstrates:
 *   - A suite of math tools covering arithmetic, algebra, statistics, and geometry
 *   - Agent selecting the right formula for each problem
 *   - Clear, formatted output from each tool
 *   - Practical use case: intelligent math tutor / calculator
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function basicArithmetic(expression: string): string {
  try {
    // Simple safe eval for basic arithmetic
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    const result = Function(`"use strict"; return (${sanitized})`)();
    return `${expression} = ${result}`;
  } catch (e) {
    return `Error: could not evaluate '${expression}'`;
  }
}

function statisticsSummary(numbers: string): string {
  const nums = numbers.split(',').map((x) => parseFloat(x.trim())).filter((n) => !isNaN(n));
  if (nums.length < 2) return 'Provide at least 2 numbers.';

  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (nums.length - 1);
  const stddev = Math.sqrt(variance);

  return [
    `Count:  ${nums.length}`,
    `Mean:   ${mean.toFixed(4)}`,
    `Median: ${median.toFixed(4)}`,
    `StdDev: ${stddev.toFixed(4)}`,
    `Min:    ${Math.min(...nums)}`,
    `Max:    ${Math.max(...nums)}`,
  ].join('\n');
}

function solveQuadratic(a: number, b: number, c: number): string {
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant > 0) {
    const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    return `Two real roots: x1 = ${x1.toFixed(6)}, x2 = ${x2.toFixed(6)}`;
  } else if (discriminant === 0) {
    const x = -b / (2 * a);
    return `One real root: x = ${x.toFixed(6)}`;
  } else {
    const real = -b / (2 * a);
    const imag = Math.sqrt(-discriminant) / (2 * a);
    return `Complex roots: x1 = ${real.toFixed(4)}+${imag.toFixed(4)}i, x2 = ${real.toFixed(4)}-${imag.toFixed(4)}i`;
  }
}

function circleProperties(radius: number): string {
  const area = Math.PI * radius ** 2;
  const circumference = 2 * Math.PI * radius;
  const diameter = 2 * radius;
  return [
    `Circle (r=${radius}):`,
    `  Diameter:      ${diameter.toFixed(4)}`,
    `  Circumference: ${circumference.toFixed(4)}`,
    `  Area:          ${area.toFixed(4)}`,
  ].join('\n');
}

function primeFactorization(n: number): string {
  if (n < 2) return `${n} has no prime factors.`;
  const factors: number[] = [];
  let temp = n;
  let d = 2;
  while (d * d <= temp) {
    while (temp % d === 0) {
      factors.push(d);
      temp = Math.floor(temp / d);
    }
    d++;
  }
  if (temp > 1) factors.push(temp);
  return `${n} = ${factors.join(' x ')}`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    let output: string;

    if (query.includes('(15') || query.includes('arithmetic') || query.includes('(15 * 4')) {
      output = basicArithmetic('(15 * 4 + 8) / 7');
    } else if (query.includes('quadratic') || query.includes('2x')) {
      output = solveQuadratic(2, -5, 3);
    } else if (query.includes('circle') && query.includes('radius')) {
      output = circleProperties(7);
    } else if (query.includes('prime') && query.includes('360')) {
      output = primeFactorization(360);
    } else if (query.includes('statistics') || query.includes('12, 45')) {
      output = statisticsSummary('12, 45, 23, 67, 34, 89, 11, 55');
    } else {
      output = 'Please provide a math problem to solve.';
    }

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const problems = [
    'What is (15 * 4 + 8) / 7?',
    'Solve 2x^2 - 5x + 3 = 0',
    'What are the properties of a circle with radius 7?',
    'Find the prime factorization of 360.',
    'Give me statistics for: 12, 45, 23, 67, 34, 89, 11, 55',
  ];

  for (const problem of problems) {
    console.log(`\nProblem: ${problem}`);
    const result = await runtime.run(langchainAgent, problem);
    result.printResult();
  }

  await runtime.shutdown();
}

main().catch(console.error);
