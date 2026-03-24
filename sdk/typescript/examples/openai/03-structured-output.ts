/**
 * OpenAI Agent with Structured Output -- enforced JSON schema response.
 *
 * Demonstrates:
 *   - Using output_type for structured, validated responses
 *   - Model settings (temperature) for deterministic output
 *   - The agent returns data matching the schema
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Output schema ---------------------------------------------------------

const movieListSchema = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          year: { type: 'number' },
          genre: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['title', 'year', 'genre', 'reason'],
      },
    },
    theme: { type: 'string' },
  },
  required: ['recommendations', 'theme'],
};

// -- Mock OpenAI Agent with structured output ------------------------------

const agent = {
  run: async (prompt: string) => ({ output: '{}' }),
  tools: [],
  model: llmModel,
  name: 'movie_recommender',
  instructions:
    'You are a movie recommendation expert. When asked for movie suggestions, ' +
    'return a structured list of recommendations with title, year, genre, ' +
    'and a brief reason for each recommendation. Identify the overall theme.',
  output_type: movieListSchema,
  model_settings: {
    temperature: 0.3,
    max_tokens: 1000,
  },
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Recommend 3 sci-fi movies that explore the concept of artificial intelligence.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
