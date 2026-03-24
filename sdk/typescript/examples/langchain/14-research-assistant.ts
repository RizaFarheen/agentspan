/**
 * Research Assistant -- structured research agent with citations.
 *
 * Demonstrates:
 *   - Multi-step research: search -> extract -> synthesize -> cite
 *   - Tools that simulate a knowledge retrieval pipeline
 *   - Generating a well-structured research report with citations
 *   - Practical use case: automated literature review / research briefing
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock knowledge base --

interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
}

const PAPERS: Record<string, Paper[]> = {
  transformer: [
    { id: 'paper_001', title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017, abstract: 'Proposes the Transformer architecture based solely on attention mechanisms, eliminating recurrence and convolutions.' },
    { id: 'paper_002', title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: 'Devlin et al.', year: 2018, abstract: 'Introduces bidirectional pre-training for language models. BERT achieves new state-of-the-art on 11 NLP tasks.' },
  ],
  'reinforcement learning': [
    { id: 'paper_003', title: 'Playing Atari with Deep Reinforcement Learning', authors: 'Mnih et al.', year: 2013, abstract: 'Demonstrates learning control policies directly from raw pixels using deep Q-networks (DQN).' },
    { id: 'paper_004', title: 'Proximal Policy Optimization Algorithms', authors: 'Schulman et al.', year: 2017, abstract: 'Proposes PPO, a practical on-policy reinforcement learning algorithm that is stable and computationally efficient.' },
  ],
  'diffusion model': [
    { id: 'paper_005', title: 'Denoising Diffusion Probabilistic Models', authors: 'Ho et al.', year: 2020, abstract: 'Presents a class of latent variable models for image synthesis using a diffusion process.' },
  ],
};

const STATS: Record<string, { adoptionRate: string; papersPerYear: string; topFrameworks: string }> = {
  transformer: { adoptionRate: '95% of modern NLP models', papersPerYear: '12,000+', topFrameworks: 'PyTorch, TensorFlow, JAX' },
  'reinforcement learning': { adoptionRate: 'Growing in robotics and games', papersPerYear: '5,000+', topFrameworks: 'Stable Baselines, RLlib, OpenAI Gym' },
  'diffusion model': { adoptionRate: 'Dominant for image generation', papersPerYear: '3,000+', topFrameworks: 'Diffusers (HuggingFace), Stable Diffusion' },
};

function searchPapers(topic: string, maxResults = 3): string {
  const topicLower = topic.toLowerCase();
  const results: Paper[] = [];
  for (const [key, papers] of Object.entries(PAPERS)) {
    if (topicLower.includes(key) || key.split(' ').some((w) => topicLower.includes(w))) {
      results.push(...papers);
    }
  }
  if (results.length === 0) return `No papers found for '${topic}'.`;
  return `Found ${Math.min(results.length, maxResults)} paper(s):\n${JSON.stringify(results.slice(0, maxResults), null, 2)}`;
}

function getFieldStatistics(field: string): string {
  const fieldLower = field.toLowerCase();
  for (const [key, stats] of Object.entries(STATS)) {
    if (fieldLower.includes(key)) {
      return [
        `Field statistics for '${key}':`,
        `  Adoption rate: ${stats.adoptionRate}`,
        `  Papers/year:   ${stats.papersPerYear}`,
        `  Top frameworks: ${stats.topFrameworks}`,
      ].join('\n');
    }
  }
  return `No statistics found for '${field}'.`;
}

function formatCitations(paperIds: string): string {
  const ids = paperIds.split(',').map((id) => id.trim());
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
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const parts: string[] = [];

    parts.push(searchPapers(query));
    parts.push(getFieldStatistics(query));
    parts.push(formatCitations('paper_001, paper_002'));

    return { output: parts.join('\n\n') };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running research assistant via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Research the transformer architecture and its impact on modern AI.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
