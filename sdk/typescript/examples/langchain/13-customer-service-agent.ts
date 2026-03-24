/**
 * Customer Service Agent -- empathetic customer support with policy tools.
 *
 * Demonstrates:
 *   - Customer service persona with empathy guidelines in system prompt
 *   - Tools for order lookup, return policy, and issue escalation
 *   - Handling different types of customer inquiries gracefully
 *   - Practical use case: Tier-1 customer support automation
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock order database --

interface Order {
  status: string;
  item: string;
  date: string;
  total: number;
}

const ORDERS: Record<string, Order> = {
  'ORD-1001': { status: 'Delivered', item: 'Wireless Headphones', date: '2025-02-28', total: 129.99 },
  'ORD-1002': { status: 'In Transit', item: 'Mechanical Keyboard', date: '2025-03-10', total: 89.00 },
  'ORD-1003': { status: 'Processing', item: 'USB-C Hub', date: '2025-03-15', total: 45.00 },
  'ORD-1004': { status: 'Cancelled', item: 'Gaming Mouse', date: '2025-03-01', total: 67.50 },
};

function lookupOrder(orderId: string): string {
  const order = ORDERS[orderId.toUpperCase()];
  if (!order) return `Order ${orderId} not found. Please check the order ID and try again.`;
  return [
    `Order ${orderId}:`,
    `  Item:   ${order.item}`,
    `  Status: ${order.status}`,
    `  Date:   ${order.date}`,
    `  Total:  $${order.total.toFixed(2)}`,
  ].join('\n');
}

function checkReturnPolicy(orderId: string): string {
  const order = ORDERS[orderId.toUpperCase()];
  if (!order) return `Order ${orderId} not found.`;
  if (order.status === 'Delivered') {
    return `Order ${orderId} (${order.item}) is eligible for return within 30 days of delivery.`;
  } else if (order.status === 'In Transit') {
    return `Order ${orderId} is currently in transit. You may request a return once delivered.`;
  } else if (order.status === 'Processing') {
    return `Order ${orderId} is still processing. You can cancel it now for a full refund.`;
  } else if (order.status === 'Cancelled') {
    return `Order ${orderId} was already cancelled. A full refund should appear within 5-7 business days.`;
  }
  return 'Return eligibility could not be determined.';
}

function getShippingInfo(carrier = 'standard'): string {
  const shipping: Record<string, string> = {
    standard: 'Standard shipping: 5-7 business days. Free on orders over $50.',
    express: 'Express shipping: 2-3 business days. $9.99 flat rate.',
    overnight: 'Overnight shipping: Next business day. $24.99 flat rate.',
  };
  return shipping[carrier.toLowerCase()] ?? 'Please contact support for shipping inquiries.';
}

function escalateToHuman(issueSummary: string, sentiment = 'neutral'): string {
  const priority = ['frustrated', 'angry'].includes(sentiment) ? 'HIGH' : 'NORMAL';
  const caseRef = Math.abs(issueSummary.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 10000)
    .toString()
    .padStart(4, '0');
  return [
    `[ESCALATION CREATED -- Priority: ${priority}]`,
    `Issue: ${issueSummary}`,
    `A human agent will contact you within ${priority === 'HIGH' ? '2 hours' : '24 hours'}.`,
    `Case reference: ESC-${caseRef}`,
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const parts: string[] = [];

    // Extract order ID
    const orderMatch = query.match(/ORD-\d+/i);

    if (orderMatch) {
      const orderId = orderMatch[0];
      parts.push(lookupOrder(orderId));

      if (query.toLowerCase().includes('return')) {
        parts.push(checkReturnPolicy(orderId));
      }
    }

    if (query.toLowerCase().includes('ridiculous') || query.toLowerCase().includes('frustrated')) {
      parts.push(escalateToHuman('Customer frustrated with order delay', 'frustrated'));
    }

    if (parts.length === 0) {
      parts.push('How can I help you today? Please provide your order ID so I can look into it.');
    }

    return { output: parts.join('\n\n') };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const queries = [
    "Hi, my order ORD-1002 still hasn't arrived. I ordered a week ago!",
    'I want to return my headphones from order ORD-1001. How do I do that?',
    "This is ridiculous! I've been waiting 3 weeks for order ORD-1003 and no one is helping me!",
  ];

  for (const query of queries) {
    console.log(`\nCustomer: ${query}`);
    const result = await runtime.run(langchainAgent, query);
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
