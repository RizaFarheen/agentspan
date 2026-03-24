// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * OpenAI Agent with Guardrails -- input and output validation.
 *
 * Demonstrates:
 *   - Input guardrails that validate user messages before processing
 *   - Output guardrails that validate agent responses
 *   - Running natively and via Agentspan passthrough
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import {
  Agent,
  run,
  tool,
  setTracingDisabled,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
} from '@openai/agents';
import type { InputGuardrail, OutputGuardrail, GuardrailFunctionOutput } from '@openai/agents';
import { z } from 'zod';
import { AgentRuntime } from '@agentspan/sdk';

setTracingDisabled(true);

// ── Tools ───────────────────────────────────────────────────────────

const getAccountBalance = tool({
  name: 'get_account_balance',
  description: 'Look up the balance of a bank account.',
  parameters: z.object({ account_id: z.string().describe('Account ID') }),
  execute: async ({ account_id }) => {
    const accounts: Record<string, string> = {
      'ACC-100': '$5,230.00',
      'ACC-200': '$12,750.50',
      'ACC-300': '$890.25',
    };
    return accounts[account_id] ?? `Account ${account_id} not found`;
  },
});

const transferFunds = tool({
  name: 'transfer_funds',
  description: 'Transfer funds between accounts.',
  parameters: z.object({
    from_account: z.string().describe('Source account'),
    to_account: z.string().describe('Destination account'),
    amount: z.number().describe('Amount to transfer'),
  }),
  execute: async ({ from_account, to_account, amount }) => {
    return `Transferred $${amount.toFixed(2)} from ${from_account} to ${to_account}.`;
  },
});

// ── Guardrails ──────────────────────────────────────────────────────

const checkForPii: InputGuardrail = {
  name: 'check_for_pii',
  execute: async ({ input }): Promise<GuardrailFunctionOutput> => {
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);

    // Check for SSN patterns
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
    if (ssnPattern.test(inputText)) {
      return {
        outputInfo: { reason: 'SSN detected in input' },
        tripwireTriggered: true,
      };
    }

    // Check for credit card patterns
    const ccPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
    if (ccPattern.test(inputText)) {
      return {
        outputInfo: { reason: 'Credit card number detected in input' },
        tripwireTriggered: true,
      };
    }

    return {
      outputInfo: { reason: 'No PII detected' },
      tripwireTriggered: false,
    };
  },
};

const checkOutputSafety: OutputGuardrail = {
  name: 'check_output_safety',
  execute: async ({ agentOutput }): Promise<GuardrailFunctionOutput> => {
    const outputText = String(agentOutput).toLowerCase();

    const forbiddenPhrases = [
      'internal system',
      'database password',
      'api key',
      'secret token',
    ];

    for (const phrase of forbiddenPhrases) {
      if (outputText.includes(phrase)) {
        return {
          outputInfo: { reason: `Forbidden phrase detected: '${phrase}'` },
          tripwireTriggered: true,
        };
      }
    }

    return {
      outputInfo: { reason: 'Output is safe' },
      tripwireTriggered: false,
    };
  },
};

// ── Agent with guardrails ───────────────────────────────────────────

const agent = new Agent({
  name: 'banking_assistant',
  instructions:
    'You are a secure banking assistant. Help users check account balances ' +
    'and transfer funds. Never reveal internal system details.',
  model: 'gpt-4o-mini',
  tools: [getAccountBalance, transferFunds],
  inputGuardrails: [checkForPii],
  outputGuardrails: [checkOutputSafety],
});

// ── Path 1: Native OpenAI Agents SDK execution ─────────────────────
console.log('=== Path 1: Native OpenAI Agents SDK ===\n');

// Safe input -- should pass guardrails
console.log('--- Safe input ---');
try {
  const safeResult = await run(agent, "What's the balance on account ACC-100?");
  console.log('Native output:', safeResult.finalOutput);
} catch (err: any) {
  console.log('Native path error:', err.message);
}

// Unsafe input with PII -- should trip guardrail
console.log('\n--- Unsafe input (PII) ---');
try {
  const unsafeResult = await run(agent, 'My SSN is 123-45-6789, check my balance.');
  console.log('Native output:', unsafeResult.finalOutput);
} catch (err: any) {
  if (err instanceof InputGuardrailTripwireTriggered) {
    console.log('Input guardrail triggered (expected):', err.message);
  } else {
    console.log('Native path error:', err.message);
  }
}

// ── Path 2: Agentspan passthrough ──────────────────────────────────
console.log('\n=== Path 2: Agentspan Passthrough ===\n');
const runtime = new AgentRuntime();
try {
  const agentspanResult = await runtime.run(agent, "What's the balance on account ACC-100?");
  console.log('Agentspan output:', agentspanResult.output);
} catch (err: any) {
  console.log('Agentspan path error (need AGENTSPAN_SERVER_URL):', err.message);
} finally {
  await runtime.shutdown();
}
