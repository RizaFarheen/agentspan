/**
 * Sentiment Analysis -- batch sentiment analysis with aspect-based scoring.
 *
 * Demonstrates:
 *   - Overall sentiment classification (positive/negative/neutral)
 *   - Aspect-based sentiment analysis (extracting specific dimensions)
 *   - Sentiment trends across multiple texts
 *   - Practical use case: product review analysis pipeline
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function classifySentiment(text: string): string {
  const positive = ['incredible', 'great', 'best', 'fantastic', 'appreciated', 'responsive', 'happy'];
  const negative = ['cheap', 'peeling', 'mediocre', 'disappointing', 'however'];

  const textLower = text.toLowerCase();
  const posCount = positive.filter((w) => textLower.includes(w)).length;
  const negCount = negative.filter((w) => textLower.includes(w)).length;

  let sentiment: string;
  let confidence: number;
  if (posCount > negCount) {
    sentiment = 'positive';
    confidence = Math.min(95, 60 + posCount * 10);
  } else if (negCount > posCount) {
    sentiment = 'negative';
    confidence = Math.min(95, 60 + negCount * 10);
  } else {
    sentiment = 'neutral';
    confidence = 55;
  }

  return `SENTIMENT: ${sentiment} | CONFIDENCE: ${confidence}% | REASON: Text contains ${posCount} positive and ${negCount} negative indicators.`;
}

function aspectSentiment(text: string, aspects: string): string {
  const aspectList = aspects.split(',').map((a) => a.trim());
  const textLower = text.toLowerCase();

  const results: string[] = [];
  for (const aspect of aspectList) {
    let sentiment: string;
    if (aspect === 'quality' && textLower.includes('incredible')) {
      sentiment = 'positive - "absolutely incredible"';
    } else if (aspect === 'quality' && textLower.includes('cheap')) {
      sentiment = 'negative - "feels a bit cheap"';
    } else if (aspect === 'price') {
      sentiment = textLower.includes('price point') ? 'positive - "best at this price point"' : 'not_mentioned';
    } else if (aspect === 'delivery') {
      sentiment = 'not_mentioned';
    } else if (aspect === 'support') {
      sentiment = textLower.includes('responsive') ? 'positive - "responsive and offered a replacement"' : 'not_mentioned';
    } else {
      sentiment = 'not_mentioned';
    }
    results.push(`  ${aspect}: ${sentiment}`);
  }

  return `Aspect-based analysis:\n${results.join('\n')}`;
}

function extractKeyPhrases(text: string): string {
  return [
    'Key sentiment phrases:',
    '  [+] "absolutely incredible" (sound quality)',
    '  [+] "best I\'ve heard at this price point"',
    '  [+] "battery life is great" (30+ hours)',
    '  [+] "customer support was responsive"',
    '  [-] "build quality feels a bit cheap"',
    '  [-] "ear cushions started peeling"',
    '  [-] "$150 product" (price expectation mismatch)',
  ].join('\n');
}

const SAMPLE_REVIEW =
  'I bought the wireless headphones two weeks ago and I\'m mostly happy. The sound quality ' +
  'is absolutely incredible -- best I\'ve heard at this price point. Battery life is great too, ' +
  'lasting over 30 hours. However, the build quality feels a bit cheap for a $150 product and ' +
  'the ear cushions started peeling after just two weeks. Customer support was responsive and ' +
  'offered a replacement, which I appreciated.';

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      classifySentiment(SAMPLE_REVIEW),
      '',
      aspectSentiment(SAMPLE_REVIEW, 'quality, price, delivery, support'),
      '',
      extractKeyPhrases(SAMPLE_REVIEW),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running sentiment analysis agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    `Analyze this product review in detail:\n\n${SAMPLE_REVIEW}`,
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
