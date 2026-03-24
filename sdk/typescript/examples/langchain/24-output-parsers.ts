/**
 * Output Parsers -- using LangChain output parsers inside tool functions.
 *
 * Demonstrates:
 *   - StrOutputParser for clean string extraction
 *   - CommaSeparatedListOutputParser for list output
 *   - JsonOutputParser with schema
 *   - How output parsers improve reliability of LLM-structured data
 *   - Practical use case: structured data extraction pipeline
 *
 * In production you would use:
 *   import { StrOutputParser, CommaSeparatedListOutputParser, JsonOutputParser } from '@langchain/core/output_parsers';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock parser-based tool implementations --

function extractKeywordsList(text: string, maxKeywords = 10): string {
  // Simulate CommaSeparatedListOutputParser
  const words = text.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'for', 'of', 'in', 'on', 'at', 'to', 'with', 'i', "i've", 'it', 'my', 'been']);
  const wordFreq: Record<string, number> = {};
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length > 3 && !stopWords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] ?? 0) + 1;
    }
  }
  const sorted = Object.entries(wordFreq).sort(([, a], [, b]) => b - a);
  const keywords = sorted.slice(0, maxKeywords).map(([w]) => w);
  return `Keywords: ${keywords.join(', ')}`;
}

function cleanTextExtraction(text: string, instruction: string): string {
  // Simulate StrOutputParser
  if (instruction.includes('main question')) {
    return 'What are the key features and drawbacks of the product?';
  }
  if (instruction.includes('rephrase')) {
    return text.split('.')[0].trim() + '.';
  }
  return text.slice(0, 200).trim();
}

interface ParsedReview {
  productName: string;
  overallScore: number;
  pros: string[];
  cons: string[];
  recommendation: string;
}

function parseProductReview(reviewText: string, productName: string): string {
  // Simulate JsonOutputParser
  const review: ParsedReview = {
    productName,
    overallScore: 8,
    pros: [
      'World-class noise cancellation',
      'Superb sound quality with rich bass and clear highs',
      'Fantastic battery life at 30+ hours',
    ],
    cons: [
      'Plasticky build quality for the price',
      'Bulky carrying case',
      'Overly sensitive touch controls',
      'Mediocre microphone quality for calls',
    ],
    recommendation: 'Buy (for music listening)',
  };

  const prosStr = review.pros.map((p) => `  + ${p}`).join('\n');
  const consStr = review.cons.map((c) => `  - ${c}`).join('\n');

  return [
    `Parsed review for ${review.productName}:`,
    `Score: ${review.overallScore}/10`,
    `Pros:`,
    prosStr,
    `Cons:`,
    consStr,
    `Recommendation: ${review.recommendation}`,
  ].join('\n');
}

const SAMPLE_REVIEW = `
I've been using the Sony WH-1000XM5 headphones for three months and have mixed feelings.
The noise cancellation is absolutely world-class -- I can work in a busy coffee shop without
any distraction. Sound quality is superb with rich bass and clear highs. Battery life is
fantastic at 30+ hours.

However, the build quality is disappointingly plasticky for a $400 headphone. The case is
bulky and the touch controls are overly sensitive. The microphone quality is mediocre for
calls. Overall I'd give it a 7.5/10 -- great for music listening but not ideal for the price.`;

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      extractKeywordsList(SAMPLE_REVIEW, 10),
      '',
      parseProductReview(SAMPLE_REVIEW, 'Sony WH-1000XM5'),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running output parsers agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    `Extract keywords and parse the structured review from this text:\n\n${SAMPLE_REVIEW}\n\nProduct name: Sony WH-1000XM5`,
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
