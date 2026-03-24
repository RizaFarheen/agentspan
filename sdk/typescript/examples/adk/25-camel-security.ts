/**
 * CaMeL-inspired Security Policy Agent -- controlled data flow.
 *
 * Demonstrates:
 *   - Multi-agent system with security policy enforcement
 *   - Guardrails to prevent sensitive data leakage
 *   - Sequential pipeline: collector -> validator -> responder
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function fetchUserData(userId: string): Record<string, unknown> {
  const users: Record<string, Record<string, unknown>> = {
    U001: { name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', ssn_last4: '1234', account_balance: 15000.00 },
    U002: { name: 'Bob Smith', email: 'bob@example.com', role: 'user', ssn_last4: '5678', account_balance: 3200.00 },
  };
  return users[userId] ?? { error: `User ${userId} not found` };
}

function redactSensitiveFields(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data);
    const sensitiveKeys = new Set(['ssn_last4', 'account_balance', 'email']);
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      redacted[k] = sensitiveKeys.has(k) ? '***REDACTED***' : v;
    }
    return { redacted_data: redacted };
  } catch {
    return { error: 'Could not parse data for redaction' };
  }
}

// -- Pipeline agents -------------------------------------------------------

const collector = {
  run: async (prompt: string) => ({ output: `Collect: ${prompt}` }),
  model: llmModel, name: 'data_collector',
  instruction:
    'You are a data collection agent. When asked about a user, ' +
    'call fetch_user_data with their ID. Pass the raw data along ' +
    'to the next agent for security review.',
  tools: [
    { name: 'fetch_user_data', description: 'Fetch user data from the database.', fn: fetchUserData, parameters: { type: 'object', properties: { user_id: { type: 'string' } }, required: ['user_id'] } },
  ],
  _google_adk: true,
};

const validator = {
  run: async (prompt: string) => ({ output: `Validate: ${prompt}` }),
  model: llmModel, name: 'security_validator',
  instruction:
    'You are a security validator. Review data for sensitive information ' +
    '(SSN, account balances, email addresses). Use the redact_sensitive_fields ' +
    'tool to redact any sensitive data before passing it along. ' +
    'Only pass redacted data to the next agent.',
  tools: [
    { name: 'redact_sensitive_fields', description: 'Redact sensitive fields from data before responding to users.', fn: redactSensitiveFields, parameters: { type: 'object', properties: { data: { type: 'string' } }, required: ['data'] } },
  ],
  _google_adk: true,
};

const responder = {
  run: async (prompt: string) => ({ output: `Respond: ${prompt}` }),
  model: llmModel, name: 'responder',
  instruction:
    'You are a customer service agent. Use the validated, redacted data ' +
    'to answer the user\'s question. NEVER reveal redacted information. ' +
    'If data shows ***REDACTED***, explain that the information is ' +
    'restricted for security reasons.',
  _google_adk: true,
};

// Sequential pipeline enforces data flow: collect -> validate -> respond
const pipeline = {
  run: async (prompt: string) => ({ output: `Pipeline: ${prompt}` }),
  model: llmModel, name: 'secure_data_pipeline',
  sub_agents: [collector, validator, responder],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    pipeline,
    'Tell me everything about user U001 including their financial details.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
