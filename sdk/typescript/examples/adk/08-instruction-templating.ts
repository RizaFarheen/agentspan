/**
 * Google ADK Agent with Instruction Templating -- dynamic {variable} injection.
 *
 * Demonstrates:
 *   - ADK's instruction templating with {variable} syntax
 *   - Variables resolved from session state at runtime
 *   - Agent behavior changes based on injected context
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function getUserPreferences(userId: string): Record<string, unknown> {
  const users: Record<string, Record<string, string>> = {
    user_001: {
      name: 'Alice',
      language: 'English',
      expertise: 'beginner',
      preferred_format: 'bullet points',
    },
    user_002: {
      name: 'Bob',
      language: 'English',
      expertise: 'advanced',
      preferred_format: 'detailed paragraphs',
    },
  };
  return users[userId] ?? { name: 'Guest', expertise: 'intermediate', preferred_format: 'concise' };
}

function searchTutorials(topic: string, level: string = 'intermediate'): Record<string, unknown> {
  const tutorials: Record<string, string[]> = {
    'python:beginner': [
      'Python Basics: Variables and Types',
      'Your First Python Function',
      'Lists and Loops for Beginners',
    ],
    'python:advanced': [
      'Metaclasses and Descriptors',
      'Async IO Deep Dive',
      'CPython Internals',
    ],
  };
  const results = tutorials[`${topic.toLowerCase()}:${level.toLowerCase()}`] ?? [`General ${topic} tutorial`];
  return { topic, level, tutorials: results };
}

// -- Mock ADK Agent with templated instructions ---------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Tutor: ${prompt}` }),
  model: llmModel,
  name: 'adaptive_tutor',
  instruction:
    'You are a personalized programming tutor. ' +
    'The current user is {user_name} with {expertise_level} expertise. ' +
    'Adapt your explanations to their level. ' +
    'Use the search_tutorials tool to find appropriate learning resources.',
  tools: [
    {
      name: 'get_user_preferences',
      description: 'Look up user preferences.',
      fn: getUserPreferences,
      parameters: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
        required: ['user_id'],
      },
    },
    {
      name: 'search_tutorials',
      description: 'Search for tutorials matching a topic and skill level.',
      fn: searchTutorials,
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          level: { type: 'string' },
        },
        required: ['topic'],
      },
    },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'I want to learn Python. What tutorials do you recommend?',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
