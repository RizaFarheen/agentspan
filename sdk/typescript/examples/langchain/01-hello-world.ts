/**
 * Hello World -- simplest LangChain agent with no tools.
 *
 * Demonstrates:
 *   - Creating a basic LangChain agent (mock AgentExecutor)
 *   - Running it with AgentRuntime via framework passthrough
 *   - Printing the result
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock LangChain AgentExecutor-like object --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const prompt = input.input;
    return {
      output: `Hello! I'm a LangChain agent. You said: "${prompt}". ` +
        'Here is an interesting fact: Large language models can contain hundreds of billions of parameters, ' +
        'yet they learn language patterns from simple next-token prediction.',
    };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running LangChain Hello World agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Introduce yourself and tell me one interesting fact about large language models.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
