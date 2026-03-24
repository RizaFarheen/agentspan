/**
 * ToolNode -- StateGraph with ToolNode + tools_condition for ReAct loop.
 *
 * Demonstrates:
 *   - Manually building a ReAct loop with StateGraph
 *   - Using ToolNode to execute tool calls returned by the LLM
 *   - Using tools_condition to route between tool execution and END
 *   - Message accumulation via list reducer
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
const capitals: Record<string, string> = {
  france: 'Paris',
  germany: 'Berlin',
  japan: 'Tokyo',
  brazil: 'Brasilia',
  australia: 'Canberra',
  india: 'New Delhi',
  usa: 'Washington D.C.',
  canada: 'Ottawa',
};

const populations: Record<string, string> = {
  france: '68 million',
  germany: '84 million',
  japan: '125 million',
  brazil: '215 million',
  australia: '26 million',
  india: '1.4 billion',
  usa: '335 million',
  canada: '38 million',
};

function lookupCapital(country: string): string {
  return capitals[country.toLowerCase()] ?? `Capital of ${country} is not in my database.`;
}

function lookupPopulation(country: string): string {
  return populations[country.toLowerCase()] ?? `Population data for ${country} is not available.`;
}

// ---------------------------------------------------------------------------
// Mock compiled graph (simulates agent + ToolNode + tools_condition loop)
// ---------------------------------------------------------------------------
const graph = {
  name: 'tool_node_agent',

  // Indicate messages schema for the SDK
  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const japanCapital = lookupCapital('japan');
    const japanPop = lookupPopulation('japan');
    const brazilCapital = lookupCapital('brazil');
    const brazilPop = lookupPopulation('brazil');

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'lookup_capital', args: { country: 'Japan' } },
            { name: 'lookup_population', args: { country: 'Japan' } },
            { name: 'lookup_capital', args: { country: 'Brazil' } },
            { name: 'lookup_population', args: { country: 'Brazil' } },
          ],
        },
        { role: 'tool', name: 'lookup_capital', content: japanCapital },
        { role: 'tool', name: 'lookup_population', content: japanPop },
        { role: 'tool', name: 'lookup_capital', content: brazilCapital },
        { role: 'tool', name: 'lookup_population', content: brazilPop },
        {
          role: 'assistant',
          content:
            `Japan: capital is ${japanCapital}, population is ${japanPop}. ` +
            `Brazil: capital is ${brazilCapital}, population is ${brazilPop}.`,
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
      'What is the capital and population of Japan and Brazil?',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
