/**
 * Code Agent -- create_react_agent with write_code, explain_code, and fix_bug tools.
 *
 * Demonstrates:
 *   - Domain-specific tools that return realistic, formatted code strings
 *   - Building a coding assistant that can write, explain, and fix code
 *   - Multi-step tool usage: write then explain, or analyze then fix
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function writeCode(description: string, language = 'python'): string {
  const templates: Record<string, string> = {
    'binary search': `\
def binary_search(arr: list, target: int) -> int:
    """Search for target in a sorted list. Returns index or -1."""
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
    fibonacci: `\
def fibonacci(n: int) -> list[int]:
    """Return the first n Fibonacci numbers."""
    if n <= 0:
        return []
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]`,
  };

  const descLower = description.toLowerCase();
  for (const [key, code] of Object.entries(templates)) {
    if (descLower.includes(key)) {
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
  }
  return (
    `\`\`\`${language}\n` +
    `# TODO: Implement '${description}'\n` +
    `# This is a scaffold -- fill in the logic below.\n` +
    `def solution():\n` +
    `    pass\n` +
    `\`\`\``
  );
}

function explainCode(code: string): string {
  if (code.includes('binary_search') || code.toLowerCase().includes('binary search')) {
    return (
      'This code implements binary search: it repeatedly halves a sorted list ' +
      'to find a target value in O(log n) time, returning the index or -1 if not found.'
    );
  }
  if (code.includes('fibonacci')) {
    return (
      'This code generates Fibonacci numbers: starting with 0 and 1, ' +
      'each subsequent number is the sum of the two before it.'
    );
  }
  return (
    'This code defines a function or set of operations. ' +
    'It takes inputs, processes them according to the logic provided, ' +
    'and returns a result. Review the docstring and variable names for details.'
  );
}

function fixBug(code: string, errorMessage: string): string {
  if (errorMessage.includes('IndexError') || errorMessage.toLowerCase().includes('index out of range')) {
    return (
      `# BUG FIX: Added bounds checking to prevent IndexError\n` +
      `# Original code had off-by-one error in loop range.\n` +
      `${code.replace('range(len(arr))', 'range(len(arr) - 1)')}\n` +
      `# Fixed: adjusted loop range to avoid accessing out-of-bounds index.`
    );
  }
  if (errorMessage.includes('ZeroDivisionError')) {
    return (
      `# BUG FIX: Added zero-division guard\n` +
      `${code}\n` +
      `# Fixed: wrap the division in an 'if denominator != 0' check.`
    );
  }
  return (
    `# BUG FIX APPLIED\n` +
    `# Error: ${errorMessage}\n` +
    `${code}\n` +
    `# Review the logic above and add appropriate error handling.`
  );
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'code_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const codeResult = writeCode('binary search function', 'python');
    const explanation = explainCode(codeResult);

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'write_code', args: { description: 'binary search function', language: 'python' } },
          ],
        },
        { role: 'tool', name: 'write_code', content: codeResult },
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'explain_code', args: { code: codeResult } },
          ],
        },
        { role: 'tool', name: 'explain_code', content: explanation },
        {
          role: 'assistant',
          content: `Here is the binary search implementation:\n\n${codeResult}\n\n**Explanation:** ${explanation}`,
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
    yield ['updates', { tools: { messages: [state.messages[1]] } }];
    yield ['updates', { agent: { messages: [state.messages[2]] } }];
    yield ['updates', { tools: { messages: [state.messages[3]] } }];
    yield ['updates', { agent: { messages: [state.messages[4]] } }];
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
      'Write a binary search function in Python and explain how it works.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
