/**
 * Google ADK Agent with Structured Output -- enforced JSON schema response.
 *
 * Demonstrates:
 *   - Using output_schema for structured, validated responses
 *   - Generation config for controlling model behavior
 *   - The server normalizer maps ADK's output_schema to AgentConfig.outputType
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Output schema ---------------------------------------------------------

const recipeSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    servings: { type: 'number' },
    prep_time_minutes: { type: 'number' },
    cook_time_minutes: { type: 'number' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'string' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step_number: { type: 'number' },
          instruction: { type: 'string' },
          duration_minutes: { type: 'number' },
        },
        required: ['step_number', 'instruction', 'duration_minutes'],
      },
    },
    difficulty: { type: 'string' },
  },
  required: ['name', 'servings', 'prep_time_minutes', 'cook_time_minutes', 'ingredients', 'steps', 'difficulty'],
};

// -- Mock ADK Agent --------------------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: '{}' }),
  model: llmModel,
  name: 'recipe_generator',
  instruction:
    'You are a professional chef assistant. When asked for a recipe, ' +
    'provide a complete, well-structured recipe with precise measurements, ' +
    'clear step-by-step instructions, and accurate timing.',
  output_schema: recipeSchema,
  generate_content_config: { temperature: 0.3 },
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Give me a recipe for classic Italian carbonara pasta.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
