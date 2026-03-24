/**
 * Conditional Routing -- StateGraph with add_conditional_edges.
 *
 * Demonstrates:
 *   - Using add_conditional_edges to branch based on state content
 *   - A sentiment classifier that routes to positive, negative, or neutral handlers
 *   - Multiple terminal nodes converging to END
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   builder.addConditionalEdges("classify", routeSentiment, { ... });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface SentimentState {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  response: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function classifySentiment(state: SentimentState): Partial<SentimentState> {
  const text = state.text.toLowerCase();
  const positiveWords = ['thrilled', 'promoted', 'love', 'great', 'happy', 'amazing', 'excellent'];
  const negativeWords = ['sad', 'angry', 'terrible', 'hate', 'awful', 'disappointed', 'frustrated'];

  const posCount = positiveWords.filter((w) => text.includes(w)).length;
  const negCount = negativeWords.filter((w) => text.includes(w)).length;

  let sentiment: SentimentState['sentiment'];
  if (posCount > negCount) sentiment = 'positive';
  else if (negCount > posCount) sentiment = 'negative';
  else sentiment = 'neutral';

  return { sentiment };
}

function routeSentiment(state: SentimentState): string {
  return state.sentiment;
}

function handlePositive(state: SentimentState): Partial<SentimentState> {
  return {
    response: `That's wonderful news! Congratulations on your promotion! Your hard work and dedication are clearly paying off. Keep up the amazing work!`,
  };
}

function handleNegative(state: SentimentState): Partial<SentimentState> {
  return {
    response: `I'm sorry to hear that. It's completely valid to feel that way. Remember, difficult times are temporary and things can improve. Is there anything specific I can help with?`,
  };
}

function handleNeutral(state: SentimentState): Partial<SentimentState> {
  return {
    response: `Thank you for sharing that. I'm here to help if you need anything. Feel free to ask me any questions or share more about what's on your mind.`,
  };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'sentiment_router',

  invoke: async (input: Record<string, unknown>) => {
    const text = (input.input as string) ?? '';
    let state: SentimentState = { text, sentiment: 'neutral', response: '' };

    state = { ...state, ...classifySentiment(state) };

    // Route based on sentiment
    const handlers: Record<string, (s: SentimentState) => Partial<SentimentState>> = {
      positive: handlePositive,
      negative: handleNegative,
      neutral: handleNeutral,
    };
    state = { ...state, ...handlers[state.sentiment](state) };

    return { output: state.response };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['classify', {}],
      ['positive', {}],
      ['negative', {}],
      ['neutral', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'classify'],
      // Conditional: classify -> positive | negative | neutral
      ['positive', '__end__'],
      ['negative', '__end__'],
      ['neutral', '__end__'],
    ],
  }),

  nodes: new Map([
    ['classify', {}],
    ['positive', {}],
    ['negative', {}],
    ['neutral', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const text = (input.input as string) ?? '';
    let state: SentimentState = { text, sentiment: 'neutral', response: '' };

    state = { ...state, ...classifySentiment(state) };
    yield ['updates', { classify: { sentiment: state.sentiment } }];

    const handlers: Record<string, (s: SentimentState) => Partial<SentimentState>> = {
      positive: handlePositive,
      negative: handleNegative,
      neutral: handleNeutral,
    };
    state = { ...state, ...handlers[state.sentiment](state) };
    yield ['updates', { [state.sentiment]: { response: state.response } }];

    yield ['values', { output: state.response }];
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
      "I just got promoted at work and I'm thrilled!",
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
