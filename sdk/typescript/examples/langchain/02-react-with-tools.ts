/**
 * ReAct with Tools -- LangChain agent using the ReAct reasoning pattern.
 *
 * Demonstrates:
 *   - Defining custom tool functions for country information lookup
 *   - Agent reasons through tool calls step by step
 *   - Practical use case: general-purpose assistant with lookup tools
 *
 * In production you would use:
 *   import { tool } from '@langchain/core/tools';
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool data --

const populations: Record<string, string> = {
  usa: '~335 million',
  china: '~1.4 billion',
  india: '~1.45 billion',
  germany: '~84 million',
  brazil: '~215 million',
  japan: '~123 million',
};

const capitals: Record<string, string> = {
  usa: 'Washington D.C.',
  china: 'Beijing',
  india: 'New Delhi',
  germany: 'Berlin',
  brazil: 'Brasilia',
  japan: 'Tokyo',
  france: 'Paris',
  uk: 'London',
};

const currencies: Record<string, string> = {
  usa: 'US Dollar (USD)',
  germany: 'Euro (EUR)',
  japan: 'Japanese Yen (JPY)',
  uk: 'British Pound (GBP)',
  india: 'Indian Rupee (INR)',
  china: 'Chinese Yuan (CNY)',
  brazil: 'Brazilian Real (BRL)',
};

// -- Mock LangChain AgentExecutor with tools --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    const parts: string[] = [];

    // Simulate ReAct: check what info is needed and call "tools"
    if (query.includes('capital') && query.includes('japan')) {
      parts.push(`Capital: ${capitals['japan']}`);
    }
    if (query.includes('currency') && query.includes('japan')) {
      parts.push(`Currency: ${currencies['japan']}`);
    }
    if (query.includes('population') && query.includes('japan')) {
      parts.push(`Population: ${populations['japan']}`);
    }

    const output = parts.length > 0
      ? `Here is the information about Japan:\n${parts.join('\n')}`
      : 'I could not find the requested country information.';

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running ReAct agent with tools via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'What is the capital and currency of Japan, and what is its population?',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
