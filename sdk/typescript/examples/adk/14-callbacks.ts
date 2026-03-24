/**
 * Callbacks -- before_tool_callback and after_tool_callback for tool interception.
 *
 * Mirrors the pattern from Google ADK samples (customer-service).
 * Callbacks can validate tool inputs, modify outputs, or short-circuit execution.
 *
 * NOTE: ADK callbacks are Python-side hooks. When compiled to Conductor workflows,
 * these callbacks are serialized but may not execute server-side. This example
 * demonstrates the ADK API pattern.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function lookupCustomer(customerId: string): Record<string, unknown> {
  const customers: Record<string, Record<string, unknown>> = {
    C001: { name: 'Alice Smith', tier: 'gold', balance: 1500.00 },
    C002: { name: 'Bob Jones', tier: 'silver', balance: 320.50 },
    C003: { name: 'Carol White', tier: 'bronze', balance: 50.00 },
  };
  const customer = customers[customerId.toUpperCase()];
  if (customer) return { found: true, customer_id: customerId, ...customer };
  return { found: false, error: `Customer ${customerId} not found` };
}

function applyDiscount(customerId: string, discountPercent: number): Record<string, unknown> {
  if (discountPercent > 50) return { error: 'Discount cannot exceed 50%' };
  return {
    status: 'success',
    customer_id: customerId,
    discount_applied: `${discountPercent}%`,
    message: `Applied ${discountPercent}% discount to ${customerId}`,
  };
}

function checkOrderStatus(orderId: string): Record<string, unknown> {
  const orders: Record<string, Record<string, unknown>> = {
    'ORD-1001': { status: 'shipped', tracking: 'TRK-98765', eta: '2025-04-20' },
    'ORD-1002': { status: 'processing', tracking: null, eta: '2025-04-25' },
  };
  return orders[orderId.toUpperCase()] ?? { error: `Order ${orderId} not found` };
}

// -- Mock ADK Agent with callbacks ----------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `CS: ${prompt}` }),
  model: llmModel,
  name: 'customer_service_agent',
  instruction:
    'You are a helpful customer service agent. ' +
    'Use the available tools to look up customer information, ' +
    'check order status, and apply discounts when requested. ' +
    'Always verify the customer exists before applying discounts.',
  tools: [
    { name: 'lookup_customer', description: 'Look up customer information by ID.', fn: lookupCustomer, parameters: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'] } },
    { name: 'apply_discount', description: "Apply a discount to a customer's account.", fn: applyDiscount, parameters: { type: 'object', properties: { customer_id: { type: 'string' }, discount_percent: { type: 'number' } }, required: ['customer_id', 'discount_percent'] } },
    { name: 'check_order_status', description: 'Check the status of an order.', fn: checkOrderStatus, parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Look up customer C001 and check if order ORD-1001 has shipped. ' +
      'If the customer is gold tier, apply a 10% discount.',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
