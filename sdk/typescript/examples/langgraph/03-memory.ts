/**
 * Memory with MemorySaver -- multi-turn conversation via checkpointer.
 *
 * Demonstrates:
 *   - Attaching a MemorySaver checkpointer to create_react_agent
 *   - Using sessionId to maintain conversation state across multiple turns
 *   - How the agent remembers context from earlier messages
 *
 * In production you would use:
 *   import { MemorySaver } from '@langchain/langgraph';
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   const checkpointer = new MemorySaver();
 *   const graph = createReactAgent({ llm, tools: [], checkpointer });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock in-memory checkpointer (simulates MemorySaver)
// ---------------------------------------------------------------------------
const conversationStore: Record<string, Array<{ role: string; content: string }>> = {};

const graph = {
  name: 'memory_agent',

  // Messages schema signals to the SDK that this graph uses messages
  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>, config?: Record<string, unknown>) => {
    const threadId =
      (config?.configurable as Record<string, unknown>)?.thread_id as string | undefined;
    const sessionKey = threadId ?? 'default';
    const userMsg =
      Array.isArray(input.messages) && input.messages.length > 0
        ? (input.messages[0] as Record<string, unknown>).content
        : String(input.input ?? '');

    // Load history
    if (!conversationStore[sessionKey]) {
      conversationStore[sessionKey] = [];
    }
    conversationStore[sessionKey].push({ role: 'user', content: userMsg as string });

    // Generate response based on conversation history
    const history = conversationStore[sessionKey];
    let response: string;

    // Check if the user mentioned their name previously
    const nameMention = history.find(
      (m) => m.role === 'user' && /my name is (\w+)/i.test(m.content),
    );
    const nameMatch = nameMention?.content.match(/my name is (\w+)/i);

    if (/what is my name/i.test(userMsg as string) && nameMatch) {
      response = `Your name is ${nameMatch[1]}! I remember you told me earlier.`;
    } else if (/my name is/i.test(userMsg as string)) {
      const match = (userMsg as string).match(/my name is (\w+)/i);
      response = `Nice to meet you, ${match?.[1] ?? 'there'}! I'll remember that.`;
    } else if (nameMatch) {
      response = `Great question, ${nameMatch[1]}! Here is something interesting about the name ${nameMatch[1]}: it has been popular in literature for centuries.`;
    } else {
      response = `I'd be happy to help! You said: "${userMsg}"`;
    }

    conversationStore[sessionKey].push({ role: 'assistant', content: response });

    return {
      messages: conversationStore[sessionKey].map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
  },

  getGraph: () => ({
    nodes: new Map([['__start__', {}], ['agent', {}], ['__end__', {}]]),
    edges: [['__start__', 'agent'], ['agent', '__end__']],
  }),

  nodes: new Map([['agent', {}]]),

  stream: async function* (input: Record<string, unknown>, config?: Record<string, unknown>) {
    const result = await graph.invoke(input, config);
    const lastMsg = result.messages[result.messages.length - 1];
    yield ['updates', { agent: { messages: [lastMsg] } }];
    yield ['values', result];
  },
};

// ---------------------------------------------------------------------------
// Run multi-turn conversation with a fixed session ID
// ---------------------------------------------------------------------------
async function main() {
  const SESSION_ID = 'user-session-001';
  const runtime = new AgentRuntime();

  try {
    console.log('=== Turn 1: Introduce a name ===');
    const result1 = await runtime.run(graph, 'My name is Alice. Please remember that.', {
      sessionId: SESSION_ID,
    });
    result1.printResult();

    console.log('\n=== Turn 2: Ask the agent to recall ===');
    const result2 = await runtime.run(graph, 'What is my name?', {
      sessionId: SESSION_ID,
    });
    result2.printResult();

    console.log('\n=== Turn 3: Continue the conversation ===');
    const result3 = await runtime.run(graph, 'Give me a fun fact about the name Alice.', {
      sessionId: SESSION_ID,
    });
    result3.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
