/**
 * Customer Service -- Real-world multi-tool agent pattern from ADK samples.
 *
 * Mirrors the customer-service ADK sample. A single agent with multiple
 * domain-specific tools handles customer inquiries end-to-end.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Domain tools ----------------------------------------------------------

function getAccountDetails(accountId: string): Record<string, unknown> {
  const accounts: Record<string, Record<string, unknown>> = {
    'ACC-001': { name: 'Alice Johnson', email: 'alice@example.com', plan: 'Premium', balance: 142.50, status: 'active' },
    'ACC-002': { name: 'Bob Martinez', email: 'bob@example.com', plan: 'Basic', balance: 0.00, status: 'active' },
  };
  return accounts[accountId.toUpperCase()] ?? { error: `Account ${accountId} not found` };
}

function getBillingHistory(accountId: string, numMonths: number = 3): Record<string, unknown> {
  const history: Record<string, Array<Record<string, unknown>>> = {
    'ACC-001': [
      { month: 'March 2025', amount: 49.99, status: 'paid' },
      { month: 'February 2025', amount: 49.99, status: 'paid' },
      { month: 'January 2025', amount: 42.50, status: 'paid' },
    ],
  };
  const records = history[accountId.toUpperCase()] ?? [];
  return { account_id: accountId, billing_history: records.slice(0, numMonths) };
}

function submitSupportTicket(accountId: string, category: string, description: string): Record<string, unknown> {
  const validCategories = ['billing', 'technical', 'account', 'general'];
  if (!validCategories.includes(category.toLowerCase())) {
    return { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` };
  }
  return {
    ticket_id: 'TKT-2025-0042',
    account_id: accountId,
    category,
    status: 'open',
    message: `Ticket created for ${category} issue`,
  };
}

function updateAccountPlan(accountId: string, newPlan: string): Record<string, unknown> {
  const plans: Record<string, number> = { basic: 19.99, premium: 49.99, enterprise: 99.99 };
  const price = plans[newPlan.toLowerCase()];
  if (!price) return { error: `Invalid plan. Available: ${Object.keys(plans).join(', ')}` };
  return {
    status: 'success',
    account_id: accountId,
    new_plan: newPlan,
    new_price: `$${price}/month`,
    effective_date: 'Next billing cycle',
  };
}

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `CS: ${prompt}` }),
  model: llmModel,
  name: 'customer_service_rep',
  instruction:
    'You are a customer service representative for CloudServe Inc. ' +
    'Help customers with account inquiries, billing questions, plan changes, ' +
    'and support tickets. Always verify the account exists before making changes. ' +
    'Be professional and empathetic.',
  tools: [
    { name: 'get_account_details', description: 'Retrieve account details for a customer.', fn: getAccountDetails, parameters: { type: 'object', properties: { account_id: { type: 'string' } }, required: ['account_id'] } },
    { name: 'get_billing_history', description: 'Get billing history for an account.', fn: getBillingHistory, parameters: { type: 'object', properties: { account_id: { type: 'string' }, num_months: { type: 'number' } }, required: ['account_id'] } },
    { name: 'submit_support_ticket', description: 'Submit a support ticket for a customer issue.', fn: submitSupportTicket, parameters: { type: 'object', properties: { account_id: { type: 'string' }, category: { type: 'string' }, description: { type: 'string' } }, required: ['account_id', 'category', 'description'] } },
    { name: 'update_account_plan', description: 'Update the subscription plan for an account.', fn: updateAccountPlan, parameters: { type: 'object', properties: { account_id: { type: 'string' }, new_plan: { type: 'string' } }, required: ['account_id', 'new_plan'] } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "I'm customer ACC-001. Can you check my billing history and tell me my current plan? " +
      "I'm thinking about downgrading to the basic plan.",
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
