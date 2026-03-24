/**
 * OpenAI Agent Handoffs -- multi-agent orchestration with handoffs.
 *
 * Demonstrates:
 *   - Defining specialist agents with handoff capability
 *   - A triage agent that routes to the correct specialist
 *   - The Conductor runtime maps OpenAI handoffs to strategy="handoff"
 *     with sub-agents, compiled into a multi-agent workflow.
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Specialist tools ------------------------------------------------------

function checkOrderStatus(orderId: string): string {
  const orders: Record<string, string> = {
    'ORD-001': 'Shipped -- arriving tomorrow',
    'ORD-002': 'Processing -- estimated ship date: Friday',
    'ORD-003': 'Delivered on Monday',
  };
  return orders[orderId] ?? `Order ${orderId} not found`;
}

function processRefund(orderId: string, reason: string): string {
  return `Refund initiated for ${orderId}. Reason: ${reason}. Expect 3-5 business days.`;
}

function getProductInfo(productName: string): string {
  const products: Record<string, string> = {
    'laptop pro': 'Laptop Pro X1 -- $1,299 -- 16GB RAM, 512GB SSD, 14" display',
    'wireless earbuds': 'SoundMax Earbuds -- $79 -- ANC, 24hr battery, Bluetooth 5.3',
    'smart watch': 'TimeSync Watch -- $249 -- GPS, health tracking, 5-day battery',
  };
  return products[productName.toLowerCase()] ?? `Product '${productName}' not found`;
}

// -- Specialist agents -----------------------------------------------------

const orderAgent = {
  run: async (prompt: string) => ({ output: `Order check: ${prompt}` }),
  tools: [
    {
      name: 'check_order_status',
      description: 'Check the status of a customer order.',
      fn: checkOrderStatus,
      parameters: {
        type: 'object',
        properties: { order_id: { type: 'string' } },
        required: ['order_id'],
      },
    },
  ],
  model: llmModel,
  name: 'order_specialist',
  instructions:
    'You handle order-related inquiries. Use the check_order_status tool ' +
    'to look up orders. Be professional and concise.',
  _openai_agent: true,
};

const refundAgent = {
  run: async (prompt: string) => ({ output: `Refund: ${prompt}` }),
  tools: [
    {
      name: 'process_refund',
      description: 'Process a refund for an order.',
      fn: processRefund,
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['order_id', 'reason'],
      },
    },
  ],
  model: llmModel,
  name: 'refund_specialist',
  instructions:
    'You handle refund requests. Use the process_refund tool to initiate ' +
    'refunds. Always confirm the order ID and reason before processing.',
  _openai_agent: true,
};

const salesAgent = {
  run: async (prompt: string) => ({ output: `Sales: ${prompt}` }),
  tools: [
    {
      name: 'get_product_info',
      description: 'Get product information and pricing.',
      fn: getProductInfo,
      parameters: {
        type: 'object',
        properties: { product_name: { type: 'string' } },
        required: ['product_name'],
      },
    },
  ],
  model: llmModel,
  name: 'sales_specialist',
  instructions:
    'You handle product inquiries and sales. Use the get_product_info tool ' +
    'to look up products. Be enthusiastic but not pushy.',
  _openai_agent: true,
};

// -- Triage agent with handoffs --------------------------------------------

const triageAgent = {
  run: async (prompt: string) => ({ output: `Triage: ${prompt}` }),
  tools: [],
  model: llmModel,
  name: 'customer_service_triage',
  instructions:
    "You are a customer service triage agent. Determine the customer's need " +
    'and hand off to the appropriate specialist:\n' +
    '- Order status inquiries -> order_specialist\n' +
    '- Refund requests -> refund_specialist\n' +
    '- Product questions or purchases -> sales_specialist\n' +
    'Be brief in your initial response before handing off.',
  handoffs: [orderAgent, refundAgent, salesAgent],
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    triageAgent,
    "I'd like a refund for order ORD-002, the product arrived damaged.",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
