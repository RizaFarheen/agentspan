/**
 * Customer Service Agent -- empathetic customer support with policy tools.
 *
 * Demonstrates:
 *   - Customer service persona with empathy guidelines in system prompt
 *   - Tools for order lookup, return policy, and issue escalation
 *   - Handling different types of customer inquiries gracefully
 *   - Practical use case: Tier-1 customer support automation
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Mock order database ─────────────────────────────────

interface Order {
  status: string;
  item: string;
  date: string;
  total: number;
}

const ORDERS: Record<string, Order> = {
  'ORD-1001': { status: 'Delivered', item: 'Wireless Headphones', date: '2025-02-28', total: 129.99 },
  'ORD-1002': { status: 'In Transit', item: 'Mechanical Keyboard', date: '2025-03-10', total: 89.0 },
  'ORD-1003': { status: 'Processing', item: 'USB-C Hub', date: '2025-03-15', total: 45.0 },
  'ORD-1004': { status: 'Cancelled', item: 'Gaming Mouse', date: '2025-03-01', total: 67.5 },
};

// ── Tool definitions ─────────────────────────────────────

const lookupOrder = new DynamicStructuredTool({
  name: 'lookup_order',
  description: 'Look up the status and details of a customer order.',
  schema: z.object({
    order_id: z.string().describe('The order ID (format: ORD-XXXX)'),
  }),
  func: async ({ order_id }) => {
    const order = ORDERS[order_id.toUpperCase()];
    if (!order) {
      return `Order ${order_id} not found. Please check the order ID and try again.`;
    }
    return (
      `Order ${order_id}:\n` +
      `  Item:   ${order.item}\n` +
      `  Status: ${order.status}\n` +
      `  Date:   ${order.date}\n` +
      `  Total:  $${order.total.toFixed(2)}`
    );
  },
});

const checkReturnPolicy = new DynamicStructuredTool({
  name: 'check_return_policy',
  description: 'Check whether an order is eligible for return or refund.',
  schema: z.object({
    order_id: z.string().describe('The order ID to check return eligibility for'),
  }),
  func: async ({ order_id }) => {
    const order = ORDERS[order_id.toUpperCase()];
    if (!order) return `Order ${order_id} not found.`;

    if (order.status === 'Delivered') {
      return (
        `Order ${order_id} (${order.item}) is eligible for return within 30 days of delivery. ` +
        'To initiate a return, visit our returns portal or reply here.'
      );
    } else if (order.status === 'In Transit') {
      return `Order ${order_id} is currently in transit. You may request a return once delivered.`;
    } else if (order.status === 'Processing') {
      return `Order ${order_id} is still processing. You can cancel it now for a full refund.`;
    } else if (order.status === 'Cancelled') {
      return `Order ${order_id} was already cancelled. A full refund should appear within 5-7 business days.`;
    }
    return 'Return eligibility could not be determined. Please contact support.';
  },
});

const getShippingInfo = new DynamicStructuredTool({
  name: 'get_shipping_info',
  description: "Get shipping timeframes and carrier information.",
  schema: z.object({
    carrier: z.string().default('standard').describe("Shipping tier — 'standard', 'express', or 'overnight'"),
  }),
  func: async ({ carrier }) => {
    const shipping: Record<string, string> = {
      standard: 'Standard shipping: 5-7 business days. Free on orders over $50.',
      express: 'Express shipping: 2-3 business days. $9.99 flat rate.',
      overnight: 'Overnight shipping: Next business day. $24.99 flat rate.',
    };
    return shipping[carrier.toLowerCase()] ?? 'Please contact support for shipping inquiries.';
  },
});

const escalateToHuman = new DynamicStructuredTool({
  name: 'escalate_to_human',
  description: 'Escalate a complex issue to a human agent.',
  schema: z.object({
    issue_summary: z.string().describe('Brief description of the issue to escalate'),
    customer_sentiment: z.string().default('neutral').describe("Customer emotional state: 'frustrated', 'angry', 'neutral', 'satisfied'"),
  }),
  func: async ({ issue_summary, customer_sentiment }) => {
    const priority = ['frustrated', 'angry'].includes(customer_sentiment) ? 'HIGH' : 'NORMAL';
    const caseRef = Math.abs(hashCode(issue_summary)) % 10000;
    return (
      `[ESCALATION CREATED — Priority: ${priority}]\n` +
      `Issue: ${issue_summary}\n` +
      `A human agent will contact you within 2 hours (high priority) or 24 hours (normal).\n` +
      `Case reference: ESC-${caseRef.toString().padStart(4, '0')}`
    );
  },
});

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
}

// ── Agent loop ───────────────────────────────────────────

const tools = [lookupOrder, checkReturnPolicy, getShippingInfo, escalateToHuman];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const CS_SYSTEM =
  'You are a friendly and empathetic customer service representative for TechShop.\n' +
  'Always:\n' +
  '- Acknowledge the customer\'s concern before looking up information\n' +
  '- Use the customer\'s name if provided\n' +
  '- Apologize for any inconvenience in a genuine, non-scripted way\n' +
  '- Offer concrete next steps after resolving the issue\n' +
  '- Escalate if you cannot resolve the issue with available tools';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(CS_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 6; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    for (const tc of toolCalls) {
      const tool = toolMap[tc.name];
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        messages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      }
    }
  }

  return 'Agent reached maximum iterations.';
}

// ── Wrap as runnable for Agentspan ─────────────────────────

const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    const output = await runAgentLoop(input.input);
    return { output };
  },
});

// Add agentspan metadata for extraction
(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

async function main() {
  const queries = [
    "Hi, my order ORD-1002 still hasn't arrived. I ordered a week ago!",
    'I want to return my headphones from order ORD-1001. How do I do that?',
    "This is ridiculous! I've been waiting 3 weeks for order ORD-1003 and no one is helping me!",
  ];

  const runtime = new AgentRuntime();
  try {
    for (const query of queries) {
      console.log(`\nCustomer: ${query}`);
      const result = await runtime.run(agentRunnable, query);
      result.printResult();
      console.log('-'.repeat(60));
    }
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('13-customer-service-agent.ts') || process.argv[1]?.endsWith('13-customer-service-agent.js')) {
  main().catch(console.error);
}
