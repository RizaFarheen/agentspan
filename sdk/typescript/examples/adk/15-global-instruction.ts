/**
 * Global Instruction -- global_instruction for system-wide context.
 *
 * Mirrors the pattern from Google ADK samples (data-science, customer-service).
 * global_instruction provides context shared across all agents, while
 * instruction is specific to each agent.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function getProductInfo(productName: string): Record<string, unknown> {
  const products: Record<string, Record<string, unknown>> = {
    'widget pro': { name: 'Widget Pro', price: 49.99, category: 'electronics', in_stock: true, rating: 4.7 },
    'gadget max': { name: 'Gadget Max', price: 89.99, category: 'electronics', in_stock: false, rating: 4.2 },
    'smart lamp': { name: 'Smart Lamp', price: 34.99, category: 'home', in_stock: true, rating: 4.5 },
  };
  return products[productName.toLowerCase()] ?? { error: `Product '${productName}' not found` };
}

function getStoreHours(location: string): Record<string, unknown> {
  const stores: Record<string, Record<string, unknown>> = {
    downtown: { hours: '9 AM - 9 PM', open_today: true },
    mall: { hours: '10 AM - 8 PM', open_today: true },
  };
  return stores[location.toLowerCase()] ?? { error: `Location '${location}' not found` };
}

// -- Mock ADK Agent with global instruction --------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Store: ${prompt}` }),
  model: llmModel,
  name: 'store_assistant',
  global_instruction:
    'You work for TechStore, a premium electronics retailer. ' +
    'Always be professional and mention our satisfaction guarantee. ' +
    'Current promotion: 15% off all electronics this week.',
  instruction:
    'You are a store assistant. Help customers find products, ' +
    'check availability, and provide store hours. ' +
    'Always mention the current promotion when discussing electronics.',
  tools: [
    { name: 'get_product_info', description: 'Look up product information.', fn: getProductInfo, parameters: { type: 'object', properties: { product_name: { type: 'string' } }, required: ['product_name'] } },
    { name: 'get_store_hours', description: 'Get store hours for a location.', fn: getStoreHours, parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "I'm looking for the Widget Pro. Is it in stock? Also, what are the downtown store hours?",
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
