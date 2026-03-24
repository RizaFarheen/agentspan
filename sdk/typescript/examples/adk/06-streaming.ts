/**
 * Google ADK Agent with Streaming -- real-time event streaming.
 *
 * Demonstrates:
 *   - Streaming events from a Google ADK agent running on Conductor
 *   - The runtime.stream() method works identically for foreign agents
 *   - Events include: thinking, tool_call, tool_result, done
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tool ------------------------------------------------------------------

function searchDocumentation(query: string): Record<string, unknown> {
  const docs: Record<string, Record<string, string>> = {
    installation: {
      title: 'Installation Guide',
      content: 'Run `pip install mypackage`. Requires Python 3.9+.',
    },
    authentication: {
      title: 'Authentication',
      content: 'Use API keys via the X-API-Key header. Keys are managed in the dashboard.',
    },
    'rate limits': {
      title: 'Rate Limiting',
      content: 'Free tier: 100 req/min. Pro: 1000 req/min. Enterprise: unlimited.',
    },
  };
  for (const [key, value] of Object.entries(docs)) {
    if (query.toLowerCase().includes(key)) {
      return { found: true, ...value };
    }
  }
  return { found: false, message: 'No matching documentation found.' };
}

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Docs: ${prompt}` }),
  model: llmModel,
  name: 'docs_assistant',
  instruction:
    'You are a documentation assistant. Use the search tool to find ' +
    'relevant docs and provide clear, well-formatted answers.',
  tools: [
    {
      name: 'search_documentation',
      description: 'Search the product documentation.',
      fn: searchDocumentation,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query string.' } },
        required: ['query'],
      },
    },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  console.log('Streaming events:\n');
  const agentStream = await runtime.stream(agent, 'How do I authenticate with the API?');
  for await (const event of agentStream) {
    const detail = event.content || event.toolName || event.output || '';
    console.log(`  [${event.type}] ${detail}`);
  }
  console.log('\nStream complete.');
} finally {
  await runtime.shutdown();
}
