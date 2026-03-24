/**
 * Content Writer -- AI-powered content generation with brand voice guidelines.
 *
 * Demonstrates:
 *   - Creating different content types (blog post, social media, email newsletter)
 *   - Adapting tone and length to the output format
 *   - Using tools for SEO keyword research and readability checks
 *   - Practical use case: automated content marketing pipeline
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { PromptTemplate } from '@langchain/core/prompts';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function generateSocialPost(topic: string, platform = 'linkedin'): string {
  const posts: Record<string, string> = {
    linkedin: `Exciting times in AI! We just launched a new AI productivity tool that helps teams work 3x faster.\n\nKey features:\n- Smart task prioritization\n- Automated meeting summaries\n- Context-aware suggestions\n\nThe future of work is here. Are you ready?\n\n#AI #Productivity #FutureOfWork #TechLaunch #Innovation`,
    twitter: 'Just launched our AI productivity tool -- 3x faster workflows, smart prioritization, and automated summaries. The future of work is here! #AI #Productivity',
    instagram: 'Meet your new AI work companion! Our latest tool brings smart task management, automated summaries, and context-aware suggestions to your workflow. Link in bio! #AI #Productivity #TechLaunch #Innovation #FutureOfWork',
  };
  return `[${platform.toUpperCase()} POST]\n${posts[platform.toLowerCase()] ?? posts.linkedin}`;
}

function generateEmailSubjectLines(topic: string, count = 5): string {
  const subjects = [
    'Your team is about to get 3x more productive',
    'The AI tool everyone is switching to',
    'Still doing tasks manually? There is a better way',
    'How top teams are saving 10+ hours per week',
    'Introducing the smartest productivity tool of 2025',
  ];
  const lines = subjects.slice(0, count).map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Email Subject Lines for '${topic}':\n${lines}`;
}

function checkReadability(text: string): string {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 'Text too short to analyze.';

  const avgSentenceLength = words.length / sentences.length;
  const avgWordLength = words.reduce((sum, w) => sum + w.replace(/[.,!?;:"']/g, '').length, 0) / words.length;
  let score = 206.835 - 1.015 * avgSentenceLength - 84.6 * (avgWordLength / 5);
  score = Math.max(0, Math.min(100, score));

  let level: string;
  if (score >= 70) level = 'Easy (general audience)';
  else if (score >= 50) level = 'Standard (high school level)';
  else if (score >= 30) level = 'Difficult (college level)';
  else level = 'Very difficult (academic/professional)';

  return [
    'Readability Analysis:',
    `  Words: ${words.length}`,
    `  Sentences: ${sentences.length}`,
    `  Avg words/sentence: ${avgSentenceLength.toFixed(1)}`,
    `  Reading level: ${level}`,
    `  Flesch score (approx): ${score.toFixed(0)}/100`,
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      generateSocialPost('AI productivity tool', 'linkedin'),
      '',
      generateEmailSubjectLines('launching a new AI productivity tool', 5),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running content writer agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Create a LinkedIn post and 5 email subject lines for launching a new AI productivity tool.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
