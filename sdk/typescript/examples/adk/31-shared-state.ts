/**
 * Google ADK Shared State -- tools sharing state via ToolContext.
 *
 * Tools can read and write context.state, a dictionary that persists
 * across tool calls within the same agent execution.
 *
 * Requirements:
 *   - Conductor server with state support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Shared state (simulated ToolContext.state) ----------------------------

const sharedState: Record<string, unknown> = {};

function addItem(item: string): Record<string, unknown> {
  const items = (sharedState.shopping_list as string[]) ?? [];
  items.push(item);
  sharedState.shopping_list = items;
  return { added: item, total_items: items.length };
}

function getList(): Record<string, unknown> {
  const items = (sharedState.shopping_list as string[]) ?? [];
  return { items, total_items: items.length };
}

function clearList(): Record<string, unknown> {
  sharedState.shopping_list = [];
  return { status: 'cleared' };
}

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Shop: ${prompt}` }),
  model: llmModel, name: 'shopping_assistant',
  instruction:
    'You help manage a shopping list. Use add_item to add items, ' +
    'get_list to view the list, and clear_list to reset it.',
  tools: [
    { name: 'add_item', description: 'Add an item to the shared shopping list.', fn: addItem, parameters: { type: 'object', properties: { item: { type: 'string' } }, required: ['item'] } },
    { name: 'get_list', description: 'Get the current shopping list from shared state.', fn: getList, parameters: { type: 'object', properties: {} } },
    { name: 'clear_list', description: 'Clear the shopping list.', fn: clearList, parameters: { type: 'object', properties: {} } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Add milk, eggs, and bread to my shopping list, then show me the list.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
