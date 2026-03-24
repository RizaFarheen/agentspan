/**
 * OpenAI Agent with Streaming -- real-time event streaming.
 *
 * Demonstrates:
 *   - Streaming events from an OpenAI agent running on Conductor
 *   - The runtime.stream() method works identically for foreign agents
 *   - Events include: thinking, tool_call, tool_result, done
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tool ------------------------------------------------------------------

function searchKnowledgeBase(query: string): string {
  const knowledge: Record<string, string> = {
    'return policy':
      'Returns accepted within 30 days with receipt. ' +
      'Electronics have a 15-day return window.',
    shipping:
      'Free shipping on orders over $50. ' +
      'Standard delivery: 3-5 business days.',
    warranty:
      'All products come with a 1-year manufacturer warranty. ' +
      'Extended warranty available for electronics.',
  };
  const queryLower = query.toLowerCase();
  for (const [key, value] of Object.entries(knowledge)) {
    if (queryLower.includes(key)) return value;
  }
  return 'No relevant information found for your query.';
}

// -- Mock OpenAI Agent -----------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Support: ${prompt}` }),
  tools: [
    {
      name: 'search_knowledge_base',
      description: 'Search the knowledge base for relevant information.',
      fn: searchKnowledgeBase,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ],
  model: llmModel,
  name: 'support_agent',
  instructions:
    'You are a customer support agent. Use the knowledge base to answer ' +
    "questions accurately. If you can't find the answer, say so honestly.",
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  console.log('Streaming events:\n');
  const agentStream = await runtime.stream(
    agent,
    "What's your return policy for electronics?",
  );
  for await (const event of agentStream) {
    const detail = event.content || event.toolName || event.output || '';
    console.log(`  [${event.type}] ${detail}`);
  }
  console.log('\nStream complete.');
} finally {
  await runtime.shutdown();
}
