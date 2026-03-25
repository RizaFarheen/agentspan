/**
 * Content Writer -- AI-powered content generation with brand voice guidelines.
 *
 * Demonstrates:
 *   - Creating different content types (blog post, social media, email subject lines)
 *   - Adapting tone and length to the output format
 *   - Using tools for readability checks
 *   - Practical use case: automated content marketing pipeline
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Shared LLM for tool-internal generation ──────────────

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0.7 });

// ── Tool definitions ─────────────────────────────────────

const generateBlogPost = new DynamicStructuredTool({
  name: 'generate_blog_post',
  description: 'Write a blog post on a given topic.',
  schema: z.object({
    topic: z.string().describe('The blog post topic or title'),
    word_count: z.number().default(300).describe('Target word count (100-1000)'),
    tone: z.string().default('professional').describe("Writing tone — 'professional', 'casual', 'technical', 'inspirational'"),
  }),
  func: async ({ topic, word_count, tone }) => {
    const clampedCount = Math.max(100, Math.min(1000, word_count));
    const response = await llm.invoke(
      `Write a ${tone} blog post about '${topic}' in approximately ${clampedCount} words. ` +
      'Include a title, introduction, 2-3 key sections, and conclusion.',
    );
    return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  },
});

const generateSocialPost = new DynamicStructuredTool({
  name: 'generate_social_post',
  description: 'Create a social media post for a given platform.',
  schema: z.object({
    topic: z.string().describe('Topic or key message for the post'),
    platform: z.string().default('linkedin').describe("Target platform — 'linkedin', 'twitter', 'instagram'"),
  }),
  func: async ({ topic, platform }) => {
    const guidelines: Record<string, string> = {
      linkedin: 'Professional tone, 150-300 words, include 3-5 relevant hashtags, call-to-action.',
      twitter: 'Under 280 characters, punchy and engaging, 1-2 hashtags, optional emoji.',
      instagram: 'Visual-forward caption, 100-200 words, 5-10 hashtags, emoji encouraged.',
    };
    const guide = guidelines[platform.toLowerCase()] ?? guidelines.linkedin;
    const response = await llm.invoke(
      `Write a ${platform} post about '${topic}'. Guidelines: ${guide}`,
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `[${platform.toUpperCase()} POST]\n${content}`;
  },
});

const generateEmailSubjectLines = new DynamicStructuredTool({
  name: 'generate_email_subject_lines',
  description: 'Generate compelling email subject lines for a marketing campaign.',
  schema: z.object({
    topic: z.string().describe('Email campaign topic or offer'),
    count: z.number().default(5).describe('Number of subject line variants (3-10)'),
  }),
  func: async ({ topic, count }) => {
    const clampedCount = Math.max(3, Math.min(10, count));
    const response = await llm.invoke(
      `Generate ${clampedCount} compelling email subject lines for a campaign about '${topic}'. ` +
      'Make them concise (under 60 characters), varied in approach ' +
      `(curiosity, urgency, benefit, question, personalization). Number them 1-${clampedCount}.`,
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Email Subject Lines for '${topic}':\n${content}`;
  },
});

const checkReadability = new DynamicStructuredTool({
  name: 'check_readability',
  description: 'Estimate the readability level of text based on sentence and word length. Returns an approximate Flesch-Kincaid grade level assessment.',
  schema: z.object({
    text: z.string().describe('Text to analyze for readability'),
  }),
  func: async ({ text }) => {
    const sentences = text
      .replace(/!/g, '.')
      .replace(/\?/g, '.')
      .split('.')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    if (sentences.length === 0 || words.length === 0) {
      return 'Text too short to analyze.';
    }

    const avgSentenceLength = words.length / sentences.length;
    const avgWordLength =
      words.reduce((sum, w) => sum + w.replace(/[.,!?;:"']/g, '').length, 0) / words.length;

    // Rough readability estimate
    let score = 206.835 - 1.015 * avgSentenceLength - 84.6 * (avgWordLength / 5);
    score = Math.max(0, Math.min(100, score));

    let level: string;
    if (score >= 70) level = 'Easy (general audience)';
    else if (score >= 50) level = 'Standard (high school level)';
    else if (score >= 30) level = 'Difficult (college level)';
    else level = 'Very difficult (academic/professional)';

    return (
      'Readability Analysis:\n' +
      `  Words: ${words.length}\n` +
      `  Sentences: ${sentences.length}\n` +
      `  Avg words/sentence: ${avgSentenceLength.toFixed(1)}\n` +
      `  Reading level: ${level}\n` +
      `  Flesch score (approx): ${score.toFixed(0)}/100`
    );
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [generateBlogPost, generateSocialPost, generateEmailSubjectLines, checkReadability];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const WRITER_SYSTEM =
  'You are a professional content strategist and writer.\n' +
  'When creating content:\n' +
  '- Always match the tone to the platform and audience\n' +
  '- Include a clear call-to-action\n' +
  '- Check readability after creating long-form content\n' +
  '- Generate multiple options when relevant (e.g., subject lines)';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(WRITER_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 8; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    for (const tc of toolCalls) {
      const tool = toolMap[tc.name];
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        messages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      }
    }
  }

  return 'Agent reached maximum iterations.';
}

// ── Wrap as runnable for Agentspan ─────────────────────────

const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    const output = await runAgentLoop(input.input);
    return { output };
  },
});

// Add agentspan metadata for extraction
(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      'Create a LinkedIn post and 5 email subject lines for launching a new AI productivity tool.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
