/**
 * ReAct Agent with Tools -- create_react_agent with practical tools.
 *
 * Demonstrates:
 *   - Defining tools with descriptions (calculator, string ops, date utils)
 *   - Passing tools to create_react_agent for a ReAct-style loop
 *   - Multi-tool invocation in a single query
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Tool implementations (mock versions of LangChain @tool-decorated functions)
// ---------------------------------------------------------------------------
function calculate(expression: string): string {
  try {
    // Safe subset: only allow digits, operators, parens, sqrt, pi
    const sanitized = expression.replace(/[^0-9+\-*/().sqrt pi]/g, '');
    const result = Function(
      '"use strict"; const sqrt = Math.sqrt; const pi = Math.PI; return (' +
        sanitized +
        ')',
    )();
    return `${result}`;
  } catch (e) {
    return `Error evaluating expression: ${e}`;
  }
}

function countWords(text: string): string {
  const words = text.trim().split(/\s+/);
  return `The text contains ${words.length} word(s).`;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Mock LangGraph compiled graph with tools
// ---------------------------------------------------------------------------
const toolDefs = [
  { name: 'calculate', description: 'Evaluate a safe mathematical expression.' },
  { name: 'count_words', description: 'Count the number of words in text.' },
  { name: 'get_today', description: "Return today's date in YYYY-MM-DD format." },
];

const toolImpls: Record<string, (args: Record<string, unknown>) => string> = {
  calculate: (args) => calculate(args.expression as string),
  count_words: (args) => countWords(args.text as string),
  get_today: () => getToday(),
};

const graph = {
  name: 'react_tools_agent',

  invoke: async (input: Record<string, unknown>) => {
    // Simulate ReAct loop: agent calls tools then produces final answer
    const sqrtResult = calculate('sqrt(256)');
    const wordResult = countWords('the quick brown fox');
    const dateResult = getToday();

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'calculate', args: { expression: 'sqrt(256)' } },
            { name: 'count_words', args: { text: 'the quick brown fox' } },
            { name: 'get_today', args: {} },
          ],
        },
        { role: 'tool', name: 'calculate', content: sqrtResult },
        { role: 'tool', name: 'count_words', content: wordResult },
        { role: 'tool', name: 'get_today', content: dateResult },
        {
          role: 'assistant',
          content:
            `The square root of 256 is ${sqrtResult}. ` +
            `The phrase "the quick brown fox" contains 4 words. ` +
            `Today's date is ${dateResult}.`,
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
    ['tools', { tools: toolDefs }],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const state = await graph.invoke(input);
    // Emit tool calls
    yield [
      'updates',
      {
        agent: {
          messages: [state.messages[0]],
        },
      },
    ];
    // Emit tool results
    yield [
      'updates',
      {
        tools: {
          messages: state.messages.slice(1, 4),
        },
      },
    ];
    // Final answer
    yield [
      'updates',
      {
        agent: {
          messages: [state.messages[4]],
        },
      },
    ];
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
      "What is the square root of 256? Also, how many words are in 'the quick brown fox'? And what is today's date?",
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
