/**
 * OpenAI Agent -- Multi-Model Handoff with different LLMs.
 *
 * Demonstrates:
 *   - Different agents using different models
 *   - Handoffs between agents with different capabilities
 *   - Model override for cost/performance optimization
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integrations configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 *   - AGENTSPAN_SECONDARY_LLM_MODEL=openai/gpt-4o as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel, secondaryLlmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function searchDocs(query: string): string {
  const docs: Record<string, string> = {
    authentication: 'Use OAuth 2.0 with JWT tokens. See /auth/login endpoint.',
    'rate limiting': '100 requests/minute per API key. 429 status on exceeded.',
    pagination: 'Use cursor-based pagination with ?cursor=xxx&limit=50.',
    webhooks: 'POST to /webhooks/register with event types and callback URL.',
  };
  for (const [key, value] of Object.entries(docs)) {
    if (query.toLowerCase().includes(key)) return value;
  }
  return 'No documentation found. Try rephrasing your query.';
}

function generateCodeSample(language: string, topic: string): string {
  const samples: Record<string, string> = {
    'python:authentication':
      "import requests\n" +
      "resp = requests.post('/auth/login', json={'key': 'API_KEY'})\n" +
      "token = resp.json()['token']",
    'javascript:authentication':
      "const resp = await fetch('/auth/login', {\n" +
      "  method: 'POST',\n" +
      "  body: JSON.stringify({ key: 'API_KEY' })\n" +
      "});\n" +
      "const { token } = await resp.json();",
  };
  return (
    samples[`${language.toLowerCase()}:${topic.toLowerCase()}`] ??
    `// Sample for ${topic} in ${language}\n// (template not available)`
  );
}

// -- Specialist agents with different models ------------------------------

const docSpecialist = {
  run: async (prompt: string) => ({ output: `Docs: ${prompt}` }),
  tools: [
    {
      name: 'search_docs',
      description: 'Search the documentation for relevant information.',
      fn: searchDocs,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ],
  model: secondaryLlmModel,
  name: 'doc_specialist',
  instructions:
    'You are a documentation specialist. Search the docs and provide ' +
    'clear, well-structured answers. Include relevant links and examples.',
  model_settings: { temperature: 0.2, max_tokens: 500 },
  _openai_agent: true,
};

const codeSpecialist = {
  run: async (prompt: string) => ({ output: `Code: ${prompt}` }),
  tools: [
    {
      name: 'generate_code_sample',
      description: 'Generate a code sample for a given topic.',
      fn: generateCodeSample,
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          topic: { type: 'string' },
        },
        required: ['language', 'topic'],
      },
    },
  ],
  model: secondaryLlmModel,
  name: 'code_specialist',
  instructions:
    'You are a code example specialist. Generate clean, well-commented ' +
    'code samples. Always specify the language and include error handling.',
  model_settings: { temperature: 0.3, max_tokens: 800 },
  _openai_agent: true,
};

// -- Triage agent (fast, cheap model) ------------------------------------

const triageAgent = {
  run: async (prompt: string) => ({ output: `Triage: ${prompt}` }),
  tools: [],
  model: llmModel,
  name: 'triage',
  instructions:
    'You are a documentation triage agent. Determine what the user needs ' +
    'and hand off to the appropriate specialist:\n' +
    '- For documentation lookups -> doc_specialist\n' +
    '- For code examples -> code_specialist\n' +
    'Keep your response to one sentence before handing off.',
  model_settings: { temperature: 0.1 },
  handoffs: [docSpecialist, codeSpecialist],
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    triageAgent,
    'I need a Python code example for authenticating with the API.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
