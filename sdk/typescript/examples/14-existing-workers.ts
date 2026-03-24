/**
 * 14 - Existing Workers — use external worker_task functions as agent tools.
 *
 * Demonstrates:
 *   - Referencing existing Conductor worker tasks as external agent tools
 *   - Mixing external and local tools in a single agent
 *   - No local worker registration needed for external tools
 *
 * In the Python SDK, existing @worker_task functions can be passed directly
 * as agent tools. In TypeScript, we use tool() with { external: true } to
 * reference existing Conductor task definitions without registering a local
 * worker — the task runs on whatever worker is already deployed.
 *
 * Requirements:
 *   - Conductor server with LLM support
 *   - The referenced worker tasks (get_customer_data, get_order_history) must
 *     be registered in Conductor (e.g., by a separate worker process)
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { z } from 'zod';
import { Agent, AgentRuntime, tool } from '../src/index.js';
import { llmModel } from './settings.js';

// --- Existing worker tasks (already deployed, already working) ---
// These reference Conductor task definitions by name. The SDK does not
// register a local worker for them — they are dispatched to whatever
// remote worker is handling those task types.

const getCustomerData = tool(
  async (_args: { customerId: string }) => {
    // This function body is never called for external tools.
    // The actual execution happens on the remote worker.
    return {};
  },
  {
    name: 'get_customer_data',
    description: 'Fetch customer data from the database.',
    inputSchema: z.object({
      customerId: z.string().describe('The customer ID to look up'),
    }),
    external: true,
  },
);

const getOrderHistory = tool(
  async (_args: { customerId: string; limit?: number }) => {
    // This function body is never called for external tools.
    return {};
  },
  {
    name: 'get_order_history',
    description: 'Retrieve recent order history for a customer.',
    inputSchema: z.object({
      customerId: z.string().describe('The customer ID'),
      limit: z.number().optional().default(5).describe('Max number of orders to return'),
    }),
    external: true,
  },
);

// --- A new local tool specific to this agent ---

const createSupportTicket = tool(
  async (args: { customerId: string; issue: string; priority?: string }) => {
    return {
      ticket_id: 'TKT-999',
      customer_id: args.customerId,
      issue: args.issue,
      priority: args.priority ?? 'medium',
    };
  },
  {
    name: 'create_support_ticket',
    description: 'Create a support ticket for a customer.',
    inputSchema: z.object({
      customerId: z.string().describe('The customer ID'),
      issue: z.string().describe('Description of the issue'),
      priority: z.string().optional().default('medium').describe('Ticket priority'),
    }),
  },
);

// --- Agent that mixes both external and local tools ---

const agent = new Agent({
  name: 'customer_support',
  model: llmModel,
  tools: [getCustomerData, getOrderHistory, createSupportTicket],
  instructions:
    'You are a customer support agent. Use the available tools to look up ' +
    'customer information, check order history, and create support tickets.',
});

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Customer C001 is asking about their recent orders. Look them up and summarize.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
