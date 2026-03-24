/**
 * Loop Agent -- LoopAgent repeats sub-agents for iterative refinement.
 *
 * Mirrors the pattern from Google ADK samples (story_teller, image-scoring).
 * The loop runs up to max_iterations times, allowing iterative improvement.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// Writer drafts content
const writer = {
  run: async (prompt: string) => ({ output: `Draft: ${prompt}` }),
  model: llmModel,
  name: 'draft_writer',
  instruction:
    'You are a writer. Write or revise a short haiku (3 lines: 5-7-5 syllables) ' +
    'about the given topic. If there is feedback from a previous critique in the conversation, ' +
    'incorporate it. Output only the haiku, nothing else.',
  _google_adk: true,
};

// Critic reviews and provides feedback
const critic = {
  run: async (prompt: string) => ({ output: `Critique: ${prompt}` }),
  model: llmModel,
  name: 'critic',
  instruction:
    'You are a poetry critic. Review the haiku from the writer. ' +
    'Check: (1) Does it follow 5-7-5 syllable structure? ' +
    '(2) Is the imagery vivid? (3) Is there a seasonal or nature element? ' +
    'Provide 1-2 sentences of constructive feedback for improvement.',
  _google_adk: true,
};

// Each iteration: write -> critique (SequentialAgent mock)
const iteration = {
  run: async (prompt: string) => ({ output: `Iteration: ${prompt}` }),
  model: llmModel,
  name: 'write_critique_cycle',
  sub_agents: [writer, critic],
  _adk_sequential: true,
  _google_adk: true,
};

// Loop the write-critique cycle 3 times (LoopAgent mock)
const refinementLoop = {
  run: async (prompt: string) => ({ output: `Loop: ${prompt}` }),
  model: llmModel,
  name: 'refinement_loop',
  sub_agents: [iteration],
  max_iterations: 3,
  _adk_loop: true,
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    refinementLoop,
    'Write a haiku about autumn leaves',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
