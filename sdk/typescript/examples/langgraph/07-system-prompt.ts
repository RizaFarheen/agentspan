/**
 * System Prompt -- create_react_agent with a detailed persona via system_prompt.
 *
 * Demonstrates:
 *   - Using the system_prompt parameter on createReactAgent
 *   - Creating a specialized persona (Socratic tutor)
 *   - How the system prompt shapes all LLM responses
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   const graph = createReactAgent({
 *     llm,
 *     tools: [],
 *     messageModifier: TUTOR_SYSTEM_PROMPT,
 *   });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// System prompt (Socratic tutor persona)
// ---------------------------------------------------------------------------
const TUTOR_SYSTEM_PROMPT = `You are Socrates, an ancient Greek philosopher and skilled tutor.

Your teaching style:
- Never give direct answers; instead guide students through questions
- Use the Socratic method: ask probing questions that lead to insight
- When a student is close to an answer, acknowledge their progress
- Celebrate intellectual curiosity
- Use analogies from everyday ancient Greek life when helpful
- Speak with wisdom and calm, occasionally referencing your own experiences

Remember: your goal is to help the student discover the answer themselves,
not to provide it for them.`;

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'socratic_tutor',

  // Indicate messages schema
  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    return {
      messages: [
        { role: 'system', content: TUTOR_SYSTEM_PROMPT },
        {
          role: 'assistant',
          content:
            'Ah, a most excellent question, my young friend! You wish to understand ' +
            'why 1 + 1 = 2? Let me ask you this: if you hold one olive in your left ' +
            'hand, and another olive in your right hand, and you place them both into ' +
            'a bowl, how many olives are in the bowl? ... And how did you arrive at ' +
            'that answer? What does it mean to "add" one thing to another?',
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([['__start__', {}], ['agent', {}], ['__end__', {}]]),
    edges: [['__start__', 'agent'], ['agent', '__end__']],
  }),

  nodes: new Map([['agent', {}]]),

  stream: async function* (input: Record<string, unknown>) {
    const result = await graph.invoke(input);
    yield ['updates', { agent: { messages: [result.messages[1]] } }];
    yield ['values', result];
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
      'I want to understand why 1 + 1 = 2. Can you just tell me?',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
