/**
 * OpenAI Agent -- Manager Pattern with agents-as-tools.
 *
 * Demonstrates:
 *   - Using agents as tools (the parent invokes them like function calls)
 *   - A manager agent that delegates to specialists via tool calls
 *   - Differs from handoffs: manager retains control and synthesizes results
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Specialist tool functions ---------------------------------------------

function analyzeSentiment(text: string): string {
  const positiveWords = new Set(['great', 'love', 'excellent', 'amazing', 'wonderful', 'best']);
  const negativeWords = new Set(['bad', 'terrible', 'hate', 'awful', 'worst', 'horrible']);

  const words = new Set(text.toLowerCase().split(/\s+/));
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (positiveWords.has(w)) pos++;
    if (negativeWords.has(w)) neg++;
  }

  if (pos > neg) return `Positive sentiment (score: ${pos}/${pos + neg})`;
  if (neg > pos) return `Negative sentiment (score: ${neg}/${pos + neg})`;
  return 'Neutral sentiment';
}

function extractKeywords(text: string): string {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
    'to', 'for', 'of', 'and', 'or', 'but', 'with', 'this', 'that', 'i',
  ]);
  const words = text.toLowerCase().split(/\s+/);
  const keywords = words
    .map((w) => w.replace(/[.,!?]/g, ''))
    .filter((w) => !stopWords.has(w) && w.length > 3);
  const unique = [...new Set(keywords)].slice(0, 10);
  return `Keywords: ${unique.join(', ')}`;
}

// -- Specialist agents (used as tools) ------------------------------------

const sentimentAgent = {
  run: async (prompt: string) => ({ output: analyzeSentiment(prompt) }),
  tools: [
    {
      name: 'analyze_sentiment',
      description: 'Analyze the sentiment of text. Returns positive, negative, or neutral.',
      fn: analyzeSentiment,
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  ],
  model: llmModel,
  name: 'sentiment_analyzer',
  instructions:
    'You analyze text sentiment. Use the analyze_sentiment tool and provide a brief interpretation.',
  _openai_agent: true,
};

const keywordAgent = {
  run: async (prompt: string) => ({ output: extractKeywords(prompt) }),
  tools: [
    {
      name: 'extract_keywords',
      description: 'Extract key topics and keywords from text.',
      fn: extractKeywords,
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  ],
  model: llmModel,
  name: 'keyword_extractor',
  instructions:
    'You extract keywords from text. Use the extract_keywords tool and categorize the results.',
  _openai_agent: true,
};

// -- Manager agent (uses specialists as tools) ----------------------------

const manager = {
  run: async (prompt: string) => ({ output: `Analysis: ${prompt}` }),
  tools: [
    {
      name: 'sentiment_analyzer',
      description: 'Analyze the sentiment of text using a specialist agent.',
      agent: sentimentAgent,
    },
    {
      name: 'keyword_extractor',
      description: 'Extract keywords and topics from text using a specialist agent.',
      agent: keywordAgent,
    },
  ],
  model: llmModel,
  name: 'text_analysis_manager',
  instructions:
    "You are a text analysis manager. When given text to analyze:\n" +
    "1. Use the sentiment analyzer to understand the tone\n" +
    "2. Use the keyword extractor to identify key topics\n" +
    "3. Synthesize the results into a concise summary\n\n" +
    "Always use both tools before providing your summary.",
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    manager,
    "Analyze this review: 'The new laptop is excellent! The display is amazing " +
      "and the battery life is wonderful. However, the keyboard feels terrible " +
      "and the trackpad is the worst I've used.'",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
