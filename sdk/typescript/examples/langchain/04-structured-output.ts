/**
 * Structured Output -- extracting structured data using with_structured_output.
 *
 * Demonstrates:
 *   - Using ChatOpenAI.with_structured_output() with a schema (Pydantic in Python, Zod in TS)
 *   - Embedding structured LLM calls inside tool functions
 *   - The outer agent returns a natural language summary of structured results
 *   - Practical use case: entity extraction from unstructured text
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock structured data extraction --

interface Person {
  name: string;
  age?: number;
  occupation?: string;
  location?: string;
}

interface PersonList {
  people: Person[];
  totalCount: number;
}

interface EventSummary {
  eventName: string;
  date?: string;
  location?: string;
  keyOutcomes: string[];
}

function extractPeopleFromText(text: string): PersonList {
  // Simulated extraction
  return {
    people: [
      { name: 'Sarah Chen', age: 52, occupation: 'Prime Minister' },
      { name: 'Marcus Rodriguez', age: 45, occupation: 'Tech CEO', location: 'San Francisco' },
      { name: 'Dr. Yuki Tanaka', age: 38, occupation: 'Economist', location: 'Tokyo' },
    ],
    totalCount: 3,
  };
}

function extractEventFromText(text: string): EventSummary {
  // Simulated extraction
  return {
    eventName: '2024 OpenAI DevDay',
    date: 'November 6th, 2024',
    location: 'San Francisco',
    keyOutcomes: [
      'GPT-4 Turbo announcement',
      'New Assistants API with code interpreter and file handling',
      'Significant price reductions across the API',
    ],
  };
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const parts: string[] = [];

    if (query.toLowerCase().includes('people') || query.toLowerCase().includes('person') || query.includes('Sarah Chen')) {
      const result = extractPeopleFromText(query);
      parts.push(`Found ${result.totalCount} person(s):`);
      for (const p of result.people) {
        const details = [p.name];
        if (p.age) details.push(`age ${p.age}`);
        if (p.occupation) details.push(p.occupation);
        if (p.location) details.push(`from ${p.location}`);
        parts.push(`  - ${details.join(', ')}`);
      }
    }

    if (query.toLowerCase().includes('event') || query.toLowerCase().includes('devday') || query.includes('OpenAI')) {
      const result = extractEventFromText(query);
      const outcomes = result.keyOutcomes.map((o) => `    - ${o}`).join('\n');
      parts.push(
        `Event: ${result.eventName}`,
        `Date:  ${result.date ?? 'Not specified'}`,
        `Location: ${result.location ?? 'Not specified'}`,
        `Outcomes:\n${outcomes}`,
      );
    }

    const output = parts.length > 0
      ? parts.join('\n')
      : 'Could not extract structured information from the provided text.';

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const texts = [
    "At yesterday's summit, Prime Minister Sarah Chen, 52, met with Tech CEO Marcus Rodriguez, " +
      '45, from San Francisco. The two discussed AI regulation. Dr. Yuki Tanaka, a 38-year-old ' +
      'economist from Tokyo, moderated the panel.',
    'The 2024 OpenAI DevDay took place in San Francisco on November 6th. Key announcements ' +
      'included GPT-4 Turbo, a new Assistants API with code interpreter and file handling, ' +
      'and significant price reductions across the API.',
  ];

  for (const text of texts) {
    console.log(`\nText: ${text.slice(0, 80)}...`);
    const result = await runtime.run(
      langchainAgent,
      `Extract all information from this text: ${text}`,
    );
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
