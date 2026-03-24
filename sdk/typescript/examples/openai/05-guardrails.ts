/**
 * OpenAI Agent with Guardrails -- input and output validation.
 *
 * Demonstrates:
 *   - Input guardrails that validate user messages before processing
 *   - Output guardrails that validate agent responses
 *   - Guardrail functions are extracted as callable workers by the
 *     Conductor runtime and compiled into the workflow.
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function getAccountBalance(accountId: string): string {
  const accounts: Record<string, string> = {
    'ACC-100': '$5,230.00',
    'ACC-200': '$12,750.50',
    'ACC-300': '$890.25',
  };
  return accounts[accountId] ?? `Account ${accountId} not found`;
}

function transferFunds(fromAccount: string, toAccount: string, amount: number): string {
  return `Transferred $${amount.toFixed(2)} from ${fromAccount} to ${toAccount}.`;
}

// -- Guardrail functions ---------------------------------------------------

function checkForPii(_ctx: unknown, _agent: unknown, inputText: string) {
  // Check for SSN patterns
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
  if (ssnPattern.test(inputText)) {
    return {
      output_info: { reason: 'SSN detected in input' },
      tripwire_triggered: true,
    };
  }
  // Check for credit card patterns
  const ccPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
  if (ccPattern.test(inputText)) {
    return {
      output_info: { reason: 'Credit card number detected in input' },
      tripwire_triggered: true,
    };
  }
  return {
    output_info: { reason: 'No PII detected' },
    tripwire_triggered: false,
  };
}

function checkOutputSafety(_ctx: unknown, _agent: unknown, output: string) {
  const outputText = String(output).toLowerCase();
  const forbiddenPhrases = [
    'internal system',
    'database password',
    'api key',
    'secret token',
  ];
  for (const phrase of forbiddenPhrases) {
    if (outputText.includes(phrase)) {
      return {
        output_info: { reason: `Forbidden phrase detected: '${phrase}'` },
        tripwire_triggered: true,
      };
    }
  }
  return {
    output_info: { reason: 'Output is safe' },
    tripwire_triggered: false,
  };
}

// -- Mock OpenAI Agent with guardrails ------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Banking: ${prompt}` }),
  tools: [
    {
      name: 'get_account_balance',
      description: 'Look up the balance of a bank account.',
      fn: getAccountBalance,
      parameters: {
        type: 'object',
        properties: { account_id: { type: 'string' } },
        required: ['account_id'],
      },
    },
    {
      name: 'transfer_funds',
      description: 'Transfer funds between accounts.',
      fn: transferFunds,
      parameters: {
        type: 'object',
        properties: {
          from_account: { type: 'string' },
          to_account: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['from_account', 'to_account', 'amount'],
      },
    },
  ],
  model: llmModel,
  name: 'banking_assistant',
  instructions:
    'You are a secure banking assistant. Help users check account balances ' +
    'and transfer funds. Never reveal internal system details.',
  input_guardrails: [{ guardrail_function: checkForPii }],
  output_guardrails: [{ guardrail_function: checkOutputSafety }],
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  // This should pass guardrails
  const result = await runtime.run(
    agent,
    "What's the balance on account ACC-100?",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
