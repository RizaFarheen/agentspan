/**
 * Chat History -- maintaining conversation history across multiple turns.
 *
 * Demonstrates:
 *   - Passing prior conversation turns via the messages list in input_data
 *   - Using session_id to maintain separate conversations per user
 *   - How AgentRuntime maps session_id to LangGraph thread_id
 *   - Practical use case: persistent multi-turn conversation with context
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { createReactAgent } from 'langchain/agents';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Simulated memory for the mock --
const conversationHistory: string[] = [];

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const message = input.input;
    conversationHistory.push(`User: ${message}`);

    let output: string;

    // Simulate recalling context from conversation history
    if (message.toLowerCase().includes('what') && message.toLowerCase().includes('name')) {
      const nameMsg = conversationHistory.find((m) => m.includes('My name is'));
      const learningMsg = conversationHistory.find((m) => m.includes('learning'));
      const parts: string[] = [];
      if (nameMsg) {
        const match = nameMsg.match(/My name is (\w+)/);
        if (match) parts.push(`Your name is ${match[1]}`);
      }
      if (learningMsg) {
        parts.push('you mentioned you are learning LangGraph for building AI agents');
      }
      output = parts.length > 0
        ? `Based on our conversation: ${parts.join(', and ')}.`
        : 'I don\'t have that information yet.';
    } else if (message.toLowerCase().includes('my name is')) {
      output = 'Nice to meet you! I\'ll remember that.';
    } else {
      output = `Got it! I've noted: ${message}`;
    }

    conversationHistory.push(`Agent: ${output}`);
    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();
  const session = 'user-session-001';

  const turns = [
    'Hi! My name is Alex and I work in data science.',
    'I\'m learning LangGraph for building AI agents.',
    'What\'s my name and what am I learning about?',
  ];

  for (let i = 0; i < turns.length; i++) {
    console.log(`\n--- Turn ${i + 1} ---`);
    console.log(`User: ${turns[i]}`);
    const result = await runtime.run(langchainAgent, turns[i], { sessionId: session });
    console.log(`Status: ${result.status}`);
    result.printResult();
  }

  await runtime.shutdown();
}

main().catch(console.error);
