/**
 * Web Search Agent -- agent that simulates web search and summarization.
 *
 * Demonstrates:
 *   - Simulated search tool returning structured mock results
 *   - Agent combining multiple search results into a coherent answer
 *   - Citation-aware summarization
 *   - Practical use case: research assistant with web search capability
 *
 * NOTE: This example uses mock search results. For production, integrate
 * Tavily, SerpAPI, or Brave Search with their respective API keys.
 *
 * In production you would use:
 *   import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock search index --

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const searchIndex: Record<string, SearchResult[]> = {
  langchain: [
    { title: 'LangChain Documentation', url: 'https://docs.langchain.com', snippet: 'LangChain is a framework for building applications with LLMs. It provides modules for chains, agents, memory, and retrieval.' },
    { title: 'LangChain GitHub', url: 'https://github.com/langchain-ai/langchain', snippet: 'Open-source Python and JavaScript library with 80k+ GitHub stars.' },
  ],
  langgraph: [
    { title: 'LangGraph Docs', url: 'https://langchain-ai.github.io/langgraph/', snippet: 'LangGraph is a library for building stateful multi-actor applications with LLMs, built on top of LangChain.' },
    { title: 'LangGraph Tutorial', url: 'https://blog.langchain.dev/langgraph/', snippet: 'LangGraph introduces graph-based orchestration of LLM workflows with support for cycles, branching, and persistence.' },
  ],
  python: [
    { title: 'Python.org', url: 'https://www.python.org', snippet: 'Python is a versatile, high-level programming language. The latest version is Python 3.13.' },
  ],
  openai: [
    { title: 'OpenAI API', url: 'https://platform.openai.com/docs', snippet: 'The OpenAI API provides access to GPT-4, DALL-E, Whisper, and Embeddings models via REST API.' },
  ],
};

const pageContent: Record<string, string> = {
  'docs.langchain.com': 'LangChain provides components including LLMs, PromptTemplates, Chains, Agents, and Memory. The LCEL allows composing these components with the | operator.',
  'langchain-ai.github.io/langgraph': 'LangGraph is built on top of LangChain and uses a graph-based approach where nodes are Python functions and edges define the flow between them.',
  'python.org': 'Python 3.13 is the latest stable release. Key features include improved error messages and a free-threaded build option.',
  'platform.openai.com': 'GPT-4o is OpenAI\'s most capable and efficient model. The API supports text, images, and function calling.',
};

function webSearch(query: string): string {
  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const [keyword, entries] of Object.entries(searchIndex)) {
    if (queryLower.includes(keyword)) results.push(...entries);
  }
  if (results.length === 0) {
    return JSON.stringify([{ title: `Search results for '${query}'`, url: `https://search.example.com/?q=${query}`, snippet: `No cached results for '${query}'.` }]);
  }
  return JSON.stringify(results.slice(0, 3), null, 2);
}

function fetchPageSummary(url: string): string {
  for (const [key, content] of Object.entries(pageContent)) {
    if (url.includes(key)) return `Page content from ${url}:\n${content}`;
  }
  return `Page at ${url} contains general information about the topic. (Mock result)`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const searchResults = webSearch(query);
    const parsed: SearchResult[] = JSON.parse(searchResults);

    const summaries: string[] = [`Search results:\n${searchResults}`];
    if (parsed.length > 0 && parsed[0].url) {
      summaries.push(fetchPageSummary(parsed[0].url));
    }

    return { output: summaries.join('\n\n') };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running web search agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Search for information about LangGraph and summarize what you find.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
