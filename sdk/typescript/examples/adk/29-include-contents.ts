/**
 * Google ADK Include Contents -- control context passed to sub-agents.
 *
 * When include_contents="none", a sub-agent starts fresh without
 * the parent's conversation history.
 *
 * Requirements:
 *   - Conductor server with include_contents support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Sub-agent with no parent context
const independentSummarizer = {
  run: async (prompt: string) => ({ output: `Summarize: ${prompt}` }),
  model: llmModel, name: 'independent_summarizer',
  instruction: 'You are a summarizer. Summarize any text given to you concisely.',
  include_contents: 'none',
  _google_adk: true,
};

// Sub-agent that sees parent context (default)
const contextAwareHelper = {
  run: async (prompt: string) => ({ output: `Help: ${prompt}` }),
  model: llmModel, name: 'context_aware_helper',
  instruction: 'You are a helpful assistant that builds on prior conversation context.',
  _google_adk: true,
};

const coordinator = {
  run: async (prompt: string) => ({ output: `Coord: ${prompt}` }),
  model: llmModel, name: 'coordinator',
  instruction:
    'You coordinate tasks. Route summarization to independent_summarizer ' +
    'and general questions to context_aware_helper.',
  sub_agents: [independentSummarizer, contextAwareHelper],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    "Please summarize this: 'The quick brown fox jumps over the lazy dog. " +
      'This sentence contains every letter of the alphabet and is commonly ' +
      "used for typography testing.'",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
