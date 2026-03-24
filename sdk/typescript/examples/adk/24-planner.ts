/**
 * Google ADK BuiltInPlanner -- agent with planning step.
 *
 * Demonstrates:
 *   - Using BuiltInPlanner to add a planning phase before execution
 *   - The agent creates a step-by-step plan, then follows it
 *   - Mapped to system prompt enhancement on the server side
 *
 * Requirements:
 *   - Conductor server
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function searchWeb(query: string): Record<string, unknown> {
  const results: Record<string, Record<string, unknown>> = {
    'climate change solutions': {
      results: [
        'Solar energy costs dropped 89% since 2010',
        'Wind power is now cheapest energy source in many regions',
        'Carbon capture technology advancing rapidly',
      ],
    },
    'renewable energy statistics': {
      results: [
        'Renewables account for 30% of global electricity (2023)',
        'Solar capacity grew 50% year-over-year',
        'China leads in renewable energy investment',
      ],
    },
  };
  for (const [key, val] of Object.entries(results)) {
    if (key.split(' ').some((word) => query.toLowerCase().includes(word))) {
      return { query, ...val };
    }
  }
  return { query, results: ['No specific results found.'] };
}

function writeSection(title: string, content: string): Record<string, unknown> {
  return { section: `## ${title}\n\n${content}` };
}

// -- Mock ADK Agent with planner ------------------------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Research: ${prompt}` }),
  model: llmModel, name: 'research_writer',
  instruction:
    'You are a research writer. When given a topic, research it ' +
    'thoroughly and write a structured report with multiple sections.',
  tools: [
    { name: 'search_web', description: 'Search the web for information.', fn: searchWeb, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'write_section', description: 'Write a section of a report.', fn: writeSection, parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'content'] } },
  ],
  planner: { thinking_config: { thinking_budget: 1024 } },
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    'Write a brief report on the current state of renewable energy ' +
      'and climate change solutions.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
