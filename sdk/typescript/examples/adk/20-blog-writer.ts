/**
 * Blog Writer -- Sequential pipeline for content creation.
 *
 * Mirrors the blog-writer ADK sample. Sub-agents with output_key collaborate
 * in a handoff pattern: researcher -> writer -> editor.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Tools -----------------------------------------------------------------

function searchTopic(topic: string): Record<string, unknown> {
  const topics: Record<string, Record<string, unknown>> = {
    ai: {
      key_points: [
        'AI adoption grew 72% in enterprises in 2024',
        'Generative AI is transforming content creation and coding',
        'AI safety and regulation are top policy priorities',
      ],
      sources: ['TechReview', 'AI Journal', 'Industry Report 2024'],
    },
    sustainability: {
      key_points: [
        'Renewable energy hit 30% of global electricity in 2024',
        'Carbon capture technology is scaling rapidly',
        'Green bonds market exceeded $500B',
      ],
      sources: ['GreenTech Weekly', 'Climate Report', 'Energy Journal'],
    },
  };
  for (const [key, data] of Object.entries(topics)) {
    if (topic.toLowerCase().includes(key)) return { found: true, ...data };
  }
  return { found: true, key_points: [`Key insight about ${topic}`], sources: ['General Research'] };
}

function checkSeoKeywords(topic: string): Record<string, unknown> {
  return {
    primary_keyword: topic.toLowerCase().replace(/ /g, '-'),
    related_keywords: [`${topic} trends`, `${topic} 2025`, `best ${topic} practices`],
    search_volume: 'high',
  };
}

// -- Sub-agents ------------------------------------------------------------

const blogResearcher = {
  run: async (prompt: string) => ({ output: `Research: ${prompt}` }),
  model: llmModel, name: 'blog_researcher',
  description: 'Researches topics and gathers key facts.',
  instruction:
    'You are a research assistant. Use the search tool to gather information ' +
    'about the given topic. Present the key findings clearly.',
  tools: [
    { name: 'search_topic', description: 'Search for information about a topic.', fn: searchTopic, parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } },
    { name: 'check_seo_keywords', description: 'Get SEO keyword suggestions for a topic.', fn: checkSeoKeywords, parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } },
  ],
  output_key: 'research_notes',
  _google_adk: true,
};

const blogWriter = {
  run: async (prompt: string) => ({ output: `Draft: ${prompt}` }),
  model: llmModel, name: 'blog_writer',
  description: 'Writes blog post drafts based on research.',
  instruction:
    'You are a blog writer. Based on the research notes provided, ' +
    'write a short blog post (3-4 paragraphs). Include a catchy title. ' +
    'Incorporate SEO keywords naturally.',
  output_key: 'blog_draft',
  _google_adk: true,
};

const blogEditor = {
  run: async (prompt: string) => ({ output: `Edited: ${prompt}` }),
  model: llmModel, name: 'blog_editor',
  description: 'Edits and polishes blog posts.',
  instruction:
    'You are a blog editor. Review and polish the blog draft. ' +
    'Improve clarity, flow, and engagement. Keep the same length. ' +
    'Output only the final polished blog post.',
  _google_adk: true,
};

const contentCoordinator = {
  run: async (prompt: string) => ({ output: `Content: ${prompt}` }),
  model: llmModel, name: 'content_coordinator',
  instruction:
    'You are a content coordinator. First use the researcher to gather information, ' +
    'then the writer to create a draft, and finally the editor to polish it. ' +
    'Present the final blog post to the user.',
  sub_agents: [blogResearcher, blogWriter, blogEditor],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    contentCoordinator,
    'Write a blog post about the conductor oss workflow and how its the best workflow engine for the agentic era. ' +
      'Make sure to write at-least 5000 words and use markdown to format the content.',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
