/**
 * Sequential Agent Pipeline -- SequentialAgent runs sub-agents in fixed order.
 *
 * Mirrors the pattern from Google ADK samples (story_teller, llm-auditor).
 * Each agent in the pipeline runs in order, with outputs flowing to the next.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Step 1: Research agent gathers facts
const researcher = {
  run: async (prompt: string) => ({ output: `Research: ${prompt}` }),
  model: llmModel,
  name: 'researcher',
  instruction:
    "You are a research assistant. Given the user's topic, " +
    'provide 3 key facts about it in a numbered list. Be concise.',
  _google_adk: true,
};

// Step 2: Writer agent creates a summary
const writer = {
  run: async (prompt: string) => ({ output: `Written: ${prompt}` }),
  model: llmModel,
  name: 'writer',
  instruction:
    'You are a skilled writer. Take the research provided in the conversation ' +
    'and write a single engaging paragraph summarizing the key points. ' +
    'Keep it under 100 words.',
  _google_adk: true,
};

// Step 3: Editor polishes the summary
const editor = {
  run: async (prompt: string) => ({ output: `Edited: ${prompt}` }),
  model: llmModel,
  name: 'editor',
  instruction:
    'You are an editor. Review the paragraph from the writer and improve it. ' +
    'Fix any issues with clarity, grammar, or flow. Output only the final polished paragraph.',
  _google_adk: true,
};

// Pipeline: researcher -> writer -> editor (SequentialAgent mock)
const pipeline = {
  run: async (prompt: string) => ({ output: `Pipeline: ${prompt}` }),
  model: llmModel,
  name: 'content_pipeline',
  sub_agents: [researcher, writer, editor],
  _adk_sequential: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(pipeline, 'The history of the Internet');
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
