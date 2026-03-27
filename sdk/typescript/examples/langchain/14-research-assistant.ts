/**
 * Research Assistant -- structured research agent with citations.
 *
 * Demonstrates:
 *   - Multi-step research: search -> extract -> synthesize -> cite
 *   - Tools that simulate a knowledge retrieval pipeline
 *   - Generating a well-structured research report with citations
 *   - Practical use case: automated literature review / research briefing
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Mock knowledge base ──────────────────────────────────

interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
}

const PAPERS: Record<string, Paper[]> = {
  transformer: [
    { id: 'paper_001', title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017, abstract: 'Proposes the Transformer architecture based solely on attention mechanisms, eliminating recurrence and convolutions. Achieves state-of-the-art results on machine translation tasks.' },
    { id: 'paper_002', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: 'Devlin et al.', year: 2018, abstract: 'Introduces bidirectional pre-training for language models. BERT achieves new state-of-the-art on 11 NLP tasks.' },
  ],
  'reinforcement learning': [
    { id: 'paper_003', title: 'Playing Atari with Deep Reinforcement Learning', authors: 'Mnih et al.', year: 2013, abstract: 'Demonstrates learning control policies directly from raw pixels using deep Q-networks (DQN). Achieves human-level performance on several Atari games.' },
    { id: 'paper_004', title: 'Proximal Policy Optimization Algorithms', authors: 'Schulman et al.', year: 2017, abstract: 'Proposes PPO, a practical on-policy reinforcement learning algorithm that is stable and computationally efficient.' },
  ],
  'diffusion model': [
    { id: 'paper_005', title: 'Denoising Diffusion Probabilistic Models', authors: 'Ho et al.', year: 2020, abstract: 'Presents a class of latent variable models for image synthesis using a diffusion process. Achieves high quality image generation.' },
  ],
};

const STATS: Record<string, { adoption_rate: string; papers_per_year: string; top_frameworks: string }> = {
  transformer: { adoption_rate: '95% of modern NLP models', papers_per_year: '12,000+', top_frameworks: 'PyTorch, TensorFlow, JAX' },
  'reinforcement learning': { adoption_rate: 'Growing in robotics and games', papers_per_year: '5,000+', top_frameworks: 'Stable Baselines, RLlib, OpenAI Gym' },
  'diffusion model': { adoption_rate: 'Dominant for image generation', papers_per_year: '3,000+', top_frameworks: 'Diffusers (HuggingFace), DALL-E, Stable Diffusion' },
};

// ── Tool definitions ─────────────────────────────────────

const searchPapers = new DynamicStructuredTool({
  name: 'search_papers',
  description: 'Search for academic papers on a research topic.',
  schema: z.object({
    topic: z.string().describe('Research topic or keyword'),
    max_results: z.number().default(3).describe('Maximum number of papers to return (1-5)'),
  }),
  func: async ({ topic, max_results }) => {
    const topicLower = topic.toLowerCase();
    const results: Paper[] = [];
    for (const [key, papers] of Object.entries(PAPERS)) {
      if (topicLower.includes(key) || key.split(' ').some((w) => topicLower.includes(w))) {
        results.push(...papers);
      }
    }
    if (results.length === 0) {
      return `No papers found for '${topic}'. Try a more specific term.`;
    }
    const limited = results.slice(0, max_results);
    return `Found ${limited.length} paper(s):\n${JSON.stringify(limited, null, 2)}`;
  },
});

const getFieldStatistics = new DynamicStructuredTool({
  name: 'get_field_statistics',
  description: "Get statistics and trends for a research field.",
  schema: z.object({
    field: z.string().describe("Research field name (e.g., 'transformer', 'reinforcement learning')"),
  }),
  func: async ({ field }) => {
    const fieldLower = field.toLowerCase();
    for (const [key, stats] of Object.entries(STATS)) {
      if (fieldLower.includes(key)) {
        return (
          `Field statistics for '${key}':\n` +
          `  Adoption rate: ${stats.adoption_rate}\n` +
          `  Papers/year:   ${stats.papers_per_year}\n` +
          `  Top frameworks: ${stats.top_frameworks}`
        );
      }
    }
    return `No statistics found for '${field}'.`;
  },
});

const summarizePaper = new DynamicStructuredTool({
  name: 'summarize_paper',
  description: 'Get a detailed summary of a specific paper by its ID.',
  schema: z.object({
    paper_id: z.string().describe("Paper ID from search results (e.g., 'paper_001')"),
  }),
  func: async ({ paper_id }) => {
    for (const papers of Object.values(PAPERS)) {
      for (const p of papers) {
        if (p.id === paper_id) {
          return (
            `Paper: ${p.title} (${p.year})\n` +
            `Authors: ${p.authors}\n` +
            `Summary: ${p.abstract}`
          );
        }
      }
    }
    return `Paper ${paper_id} not found.`;
  },
});

const formatCitations = new DynamicStructuredTool({
  name: 'format_citations',
  description: 'Format papers as academic citations (APA style).',
  schema: z.object({
    paper_ids: z.string().describe('Comma-separated list of paper IDs'),
  }),
  func: async ({ paper_ids }) => {
    const ids = paper_ids.split(',').map((id) => id.trim());
    const citations: string[] = [];
    for (const paperId of ids) {
      for (const papers of Object.values(PAPERS)) {
        for (const p of papers) {
          if (p.id === paperId) {
            citations.push(`${p.authors} (${p.year}). ${p.title}.`);
          }
        }
      }
    }
    if (citations.length > 0) {
      return 'References:\n' + citations.map((c, i) => `[${i + 1}] ${c}`).join('\n');
    }
    return 'No valid paper IDs found.';
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [searchPapers, getFieldStatistics, summarizePaper, formatCitations];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const RESEARCH_SYSTEM =
  'You are a systematic research assistant. For each research request:\n' +
  '1. Search for relevant papers on the topic\n' +
  '2. Get field statistics to understand the landscape\n' +
  '3. Summarize the most important paper(s)\n' +
  '4. Format proper citations\n' +
  '5. Write a concise 3-paragraph research brief covering: background, key findings, implications';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(RESEARCH_SYSTEM),
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
      'Research the transformer architecture and its impact on modern AI.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('14-research-assistant.ts') || process.argv[1]?.endsWith('14-research-assistant.js')) {
  main().catch(console.error);
}
