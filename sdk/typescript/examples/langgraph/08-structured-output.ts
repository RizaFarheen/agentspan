/**
 * Structured Output -- create_react_agent with response_format for typed output.
 *
 * Demonstrates:
 *   - Passing a schema as response_format to create_react_agent
 *   - Forcing the LLM to return structured, typed data
 *   - Accessing fields of the structured response
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { z } from 'zod';
 *   const MovieReview = z.object({ title: z.string(), rating: z.number(), ... });
 *   const graph = createReactAgent({ llm, tools: [], responseFormat: MovieReview });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Structured output schema (mirrors Pydantic MovieReview)
// ---------------------------------------------------------------------------
interface MovieReview {
  title: string;
  rating: number;
  pros: string[];
  cons: string[];
  summary: string;
  recommended: boolean;
}

// ---------------------------------------------------------------------------
// Mock compiled graph that returns structured output
// ---------------------------------------------------------------------------
const graph = {
  name: 'movie_review_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const review: MovieReview = {
      title: 'Inception',
      rating: 9.2,
      pros: [
        'Mind-bending narrative that rewards multiple viewings',
        'Outstanding visual effects and cinematography',
        'Stellar ensemble cast led by Leonardo DiCaprio',
      ],
      cons: [
        'Complex plot may confuse some viewers on first watch',
        'Emotional depth occasionally sacrificed for spectacle',
      ],
      summary:
        'Inception is a masterful sci-fi thriller that challenges viewers with its layered dream-within-a-dream concept while delivering spectacular action.',
      recommended: true,
    };

    return {
      messages: [
        {
          role: 'assistant',
          content: JSON.stringify(review, null, 2),
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([['__start__', {}], ['agent', {}], ['__end__', {}]]),
    edges: [['__start__', 'agent'], ['agent', '__end__']],
  }),

  nodes: new Map([['agent', {}]]),

  stream: async function* (input: Record<string, unknown>) {
    const result = await graph.invoke(input);
    yield ['updates', { agent: { messages: result.messages } }];
    yield ['values', result];
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
      'Write a review for the movie Inception (2010).',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
