/**
 * Hello World -- simplest LangGraph agent with no tools.
 *
 * Demonstrates:
 *   - Using create_react_agent (returns CompiledStateGraph)
 *   - Running a graph with AgentRuntime via framework passthrough
 *   - Printing the result
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { ChatOpenAI } from '@langchain/openai';
 *   const graph = createReactAgent({ llm: new ChatOpenAI({ model: 'gpt-4o-mini' }), tools: [] });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock LangGraph compiled graph (duck-typed for framework detection)
// In real usage: const graph = createReactAgent({ llm, tools: [] });
// ---------------------------------------------------------------------------
const graph = {
  name: 'hello_world_agent',

  invoke: async (input: Record<string, unknown>) => {
    const msgs = input.messages as Array<Record<string, unknown>> | undefined;
    const prompt =
      msgs && msgs.length > 0 && typeof msgs[0] === 'object'
        ? msgs[0].content
        : input.input;
    return {
      messages: [
        { role: 'user', content: prompt },
        {
          role: 'assistant',
          content: `Hello! Here is a fun fact: Python was named after Monty Python, not the snake. The language was first released in 1991 by Guido van Rossum.`,
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([['__start__', {}], ['agent', {}], ['__end__', {}]]),
    edges: [
      ['__start__', 'agent'],
      ['agent', '__end__'],
    ],
  }),

  nodes: new Map([['agent', {}]]),

  stream: async function* (input: Record<string, unknown>) {
    const result = await graph.invoke(input);
    yield ['updates', { agent: { messages: [result.messages[1]] } }];
    yield ['values', result];
  },
};

// ---------------------------------------------------------------------------
// Run via Agentspan -- the runtime detects LangGraph (has invoke + getGraph)
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    console.log('Running LangGraph hello-world agent via Agentspan...');
    const result = await runtime.run(
      graph,
      'Say hello and tell me a fun fact about Python programming.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
