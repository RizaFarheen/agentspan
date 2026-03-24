/**
 * Google ADK Agent with Generation Config -- temperature and output control.
 *
 * Demonstrates:
 *   - Using generate_content_config for model tuning
 *   - Low temperature for factual/deterministic responses
 *   - High temperature for creative responses
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Precise agent -- low temperature for factual responses
const factualAgent = {
  run: async (prompt: string) => ({ output: `Fact: ${prompt}` }),
  model: llmModel,
  name: 'fact_checker',
  instruction:
    'You are a precise fact-checker. Provide accurate, well-sourced ' +
    'answers. Be concise and avoid speculation.',
  generate_content_config: { temperature: 0.1 },
  _google_adk: true,
};

// Creative agent -- high temperature for creative writing
const creativeAgent = {
  run: async (prompt: string) => ({ output: `Story: ${prompt}` }),
  model: llmModel,
  name: 'storyteller',
  instruction:
    'You are an imaginative storyteller. Create vivid, engaging ' +
    'narratives with rich descriptions and unexpected twists.',
  generate_content_config: { temperature: 0.9 },
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  console.log('=== Factual Agent (temp=0.1) ===');
  const result1 = await runtime.run(
    factualAgent,
    'What is the speed of light in a vacuum?',
  );
  result1.printResult();

  console.log('\n=== Creative Agent (temp=0.9) ===');
  const result2 = await runtime.run(
    creativeAgent,
    'Write a two-sentence story about a cat who discovered a hidden library.',
  );
  result2.printResult();
} finally {
  await runtime.shutdown();
}
