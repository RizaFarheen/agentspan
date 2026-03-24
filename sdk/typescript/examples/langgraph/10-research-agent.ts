/**
 * Research Agent -- create_react_agent with search, summarize, and cite_source tools.
 *
 * Demonstrates:
 *   - Combining search, summarization, and citation tools in one agent
 *   - Mock implementations returning realistic research-style data
 *   - Building a multi-step research workflow via tool chaining
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock research database
// ---------------------------------------------------------------------------
const MOCK_SEARCH_RESULTS: Record<string, string[]> = {
  'climate change': [
    'Global temperatures have risen ~1.1C since pre-industrial times (IPCC, 2023).',
    'Sea levels are rising at 3.7 mm/year due to thermal expansion and ice melt.',
    'Extreme weather events have increased in frequency and intensity since 1980.',
  ],
  'artificial intelligence': [
    'Large language models (LLMs) have achieved human-level performance on many benchmarks.',
    'The global AI market is projected to reach $1.8 trillion by 2030.',
    'AI ethics and alignment remain active research challenges.',
  ],
  'renewable energy': [
    'Solar PV costs have dropped 89% in the past decade.',
    'Wind power capacity exceeded 900 GW globally in 2023.',
    'Battery storage is the key bottleneck for 100% renewable grids.',
  ],
};

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function search(query: string): string {
  const queryLower = query.toLowerCase();
  for (const [key, results] of Object.entries(MOCK_SEARCH_RESULTS)) {
    if (queryLower.includes(key)) {
      return results.map((r) => `- ${r}`).join('\n');
    }
  }
  return `No specific results found for '${query}'. Try a broader search term.`;
}

function summarize(text: string, maxSentences = 3): string {
  const sentences = text
    .replace(/\n/g, '. ')
    .split('. ')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const selected = sentences.slice(0, maxSentences);
  const result = selected.join(' ');
  return result.endsWith('.') ? result : result + '.';
}

function citeSource(claim: string, sourceType = 'academic'): string {
  const citations: Record<string, string> = {
    academic:
      'Smith, J., & Doe, A. (2024). Research findings on the topic. Journal of Science, 12(3), 45-67.',
    news: 'Reuters. (2024, January 15). New developments in research. Reuters.com.',
    report: 'World Economic Forum. (2024). Global Report 2024. WEF Publications.',
  };
  const source = citations[sourceType] ?? citations['academic'];
  return `Claim: '${claim.slice(0, 80)}...'\nCitation: ${source}`;
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'research_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const searchResult = search('climate change');
    const summary = summarize(searchResult);
    const citation = citeSource('Global temperatures have risen', 'academic');

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [{ name: 'search', args: { query: 'climate change' } }],
        },
        { role: 'tool', name: 'search', content: searchResult },
        {
          role: 'ai',
          content: null,
          tool_calls: [{ name: 'summarize', args: { text: searchResult, max_sentences: 3 } }],
        },
        { role: 'tool', name: 'summarize', content: summary },
        {
          role: 'ai',
          content: null,
          tool_calls: [
            {
              name: 'cite_source',
              args: { claim: 'Global temperatures have risen', source_type: 'academic' },
            },
          ],
        },
        { role: 'tool', name: 'cite_source', content: citation },
        {
          role: 'assistant',
          content: `Research Summary on Climate Change:\n\n${summary}\n\nSource:\n${citation}`,
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['agent', {}],
      ['tools', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'agent'],
      ['agent', 'tools'],
      ['tools', 'agent'],
      ['agent', '__end__'],
    ],
  }),

  nodes: new Map([
    ['agent', {}],
    ['tools', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const state = await graph.invoke(input);
    for (let i = 0; i < state.messages.length - 1; i += 2) {
      const nodeName = state.messages[i].role === 'tool' ? 'tools' : 'agent';
      yield ['updates', { [nodeName]: { messages: [state.messages[i]] } }];
    }
    yield ['values', state];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      graph,
      'What are the latest developments in climate change research? Include sources.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
