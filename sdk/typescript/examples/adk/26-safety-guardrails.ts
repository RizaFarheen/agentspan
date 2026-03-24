/**
 * Safety Guardrails -- global safety enforcement using PII detection.
 *
 * Demonstrates:
 *   - Output guardrails that evaluate every agent response
 *   - Combining multiple safety checks (PII detection, sanitization)
 *   - Using sequential pipeline to enforce guardrails
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function checkPii(text: string): Record<string, unknown> {
  const patterns: Record<string, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  };
  const found: Record<string, number> = {};
  for (const [piiType, pattern] of Object.entries(patterns)) {
    const matches = text.match(pattern);
    if (matches) found[piiType] = matches.length;
  }
  return { has_pii: Object.keys(found).length > 0, pii_types: found, text_length: text.length };
}

function sanitizeResponse(text: string): Record<string, unknown> {
  let sanitized = text;
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]');
  sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE REDACTED]');
  sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]');
  sanitized = sanitized.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD REDACTED]');
  return { sanitized_text: sanitized, was_modified: sanitized !== text };
}

// -- Pipeline agents -------------------------------------------------------

const assistant = {
  run: async (prompt: string) => ({ output: `Help: ${prompt}` }),
  model: llmModel, name: 'helpful_assistant',
  instruction:
    'You are a helpful customer service assistant. Answer questions ' +
    'about account details, contact information, and general inquiries. ' +
    'When providing information, include relevant details.',
  _google_adk: true,
};

const safetyChecker = {
  run: async (prompt: string) => ({ output: `Safe: ${prompt}` }),
  model: llmModel, name: 'safety_checker',
  instruction:
    "You are a safety reviewer. Check the previous agent's response " +
    'for any PII (emails, phone numbers, SSNs, credit card numbers). ' +
    'Use check_pii on the response text. If PII is found, use ' +
    'sanitize_response to clean it. Pass the clean version along.',
  tools: [
    { name: 'check_pii', description: 'Check text for personally identifiable information.', fn: checkPii, parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'sanitize_response', description: 'Remove or mask PII from a response.', fn: sanitizeResponse, parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  ],
  _google_adk: true,
};

const safePipeline = {
  run: async (prompt: string) => ({ output: `SafePipeline: ${prompt}` }),
  model: llmModel, name: 'safe_assistant',
  sub_agents: [assistant, safetyChecker],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    safePipeline,
    'What are the contact details for our support team? ' +
      'Include email support@company.com and phone 555-123-4567.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
