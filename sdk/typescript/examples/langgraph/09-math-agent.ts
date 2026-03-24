/**
 * Math Agent -- create_react_agent with comprehensive arithmetic and math tools.
 *
 * Demonstrates:
 *   - Defining multiple related tools in a single agent
 *   - Using create_react_agent for a specialized domain (mathematics)
 *   - Chaining multiple tool calls to solve multi-step problems
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Math tool implementations
// ---------------------------------------------------------------------------
function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function divide(a: number, b: number): string {
  if (b === 0) return 'Error: Division by zero is undefined.';
  return String(a / b);
}

function power(base: number, exponent: number): number {
  return base ** exponent;
}

function sqrt(n: number): string {
  if (n < 0) return `Error: Cannot compute the square root of a negative number (${n}).`;
  return String(Math.sqrt(n));
}

function factorial(n: number): string {
  if (n < 0) return 'Error: Factorial is not defined for negative numbers.';
  if (n > 20) return 'Error: Input too large (max 20 to avoid overflow).';
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return String(result);
}

// ---------------------------------------------------------------------------
// Mock compiled graph with math tools
// ---------------------------------------------------------------------------
const graph = {
  name: 'math_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    // Simulate the ReAct loop solving: (2^10 + sqrt(144)) / 4, then 5!
    const step1 = power(2, 10); // 1024
    const step2 = sqrt(144); // 12
    const step3 = add(step1, Number(step2)); // 1036
    const step4 = divide(step3, 4); // 259
    const step5 = factorial(5); // 120

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'power', args: { base: 2, exponent: 10 } },
            { name: 'sqrt', args: { n: 144 } },
          ],
        },
        { role: 'tool', name: 'power', content: String(step1) },
        { role: 'tool', name: 'sqrt', content: step2 },
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'add', args: { a: step1, b: Number(step2) } },
          ],
        },
        { role: 'tool', name: 'add', content: String(step3) },
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'divide', args: { a: step3, b: 4 } },
            { name: 'factorial', args: { n: 5 } },
          ],
        },
        { role: 'tool', name: 'divide', content: step4 },
        { role: 'tool', name: 'factorial', content: step5 },
        {
          role: 'assistant',
          content:
            `The calculation (2^10 + sqrt(144)) / 4 = (1024 + 12) / 4 = 1036 / 4 = ${step4}. ` +
            `And 5! = ${step5}.`,
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
    // Emit updates for each agent/tools cycle
    yield ['updates', { agent: { messages: [state.messages[0]] } }];
    yield ['updates', { tools: { messages: state.messages.slice(1, 3) } }];
    yield ['updates', { agent: { messages: [state.messages[3]] } }];
    yield ['updates', { tools: { messages: [state.messages[4]] } }];
    yield ['updates', { agent: { messages: [state.messages[5]] } }];
    yield ['updates', { tools: { messages: state.messages.slice(6, 8) } }];
    yield ['updates', { agent: { messages: [state.messages[8]] } }];
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
      'Calculate: (2^10 + sqrt(144)) / 4, then compute 5! and tell me the final answers.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
