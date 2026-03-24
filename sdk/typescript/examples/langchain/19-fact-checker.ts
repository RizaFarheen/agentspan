/**
 * Fact Checker -- agent that verifies factual claims against a knowledge base.
 *
 * Demonstrates:
 *   - Looking up claims against a curated fact database
 *   - Distinguishing between verified, unverified, and false claims
 *   - Providing sources and confidence scores
 *   - Practical use case: automated misinformation detection assistant
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Fact database --

interface FactEntry {
  claim: string;
  verdict: string;
  detail: string;
  source: string;
  confidence: number;
}

const FACT_DB: Record<string, FactEntry> = {
  python_created: {
    claim: 'Python was created by Guido van Rossum',
    verdict: 'TRUE',
    detail: 'Python was created by Guido van Rossum and first released in 1991.',
    source: 'Python official history (python.org)',
    confidence: 0.99,
  },
  python_year: {
    claim: 'Python was first released in 1991',
    verdict: 'TRUE',
    detail: 'Python 0.9.0 was released in February 1991.',
    source: 'Python official history (python.org)',
    confidence: 0.98,
  },
  earth_sun_distance: {
    claim: 'The Earth is approximately 93 million miles from the Sun',
    verdict: 'TRUE',
    detail: 'Average Earth-Sun distance is ~93 million miles (150 million km), also known as 1 AU.',
    source: 'NASA Solar System Exploration',
    confidence: 0.99,
  },
  water_formula: {
    claim: 'Water has the chemical formula H2O',
    verdict: 'TRUE',
    detail: 'Water consists of two hydrogen atoms and one oxygen atom.',
    source: 'Standard chemistry reference',
    confidence: 1.0,
  },
  great_wall_visible: {
    claim: 'The Great Wall of China is visible from space with the naked eye',
    verdict: 'FALSE',
    detail: 'This is a common myth. Astronauts and NASA have confirmed the Great Wall cannot be seen from space without aid.',
    source: 'NASA, Chinese astronaut Yang Liwei (2003)',
    confidence: 0.97,
  },
  lightning_twice: {
    claim: 'Lightning never strikes the same place twice',
    verdict: 'FALSE',
    detail: 'Lightning frequently strikes the same location. The Empire State Building is struck ~20-25 times per year.',
    source: 'NOAA Lightning Safety Program',
    confidence: 0.99,
  },
};

function lookUpFact(claim: string): string {
  const claimLower = claim.toLowerCase();
  const claimWords = new Set(claimLower.split(/\s+/));

  let bestMatch: FactEntry | null = null;
  let bestOverlap = 0;

  for (const fact of Object.values(FACT_DB)) {
    const factWords = new Set(fact.claim.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of factWords) {
      if (claimWords.has(w)) overlap++;
    }
    if (overlap >= 3 && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = fact;
    }
  }

  if (!bestMatch) {
    return `No matching facts found for: '${claim}'. Cannot verify with current knowledge base.`;
  }

  return [
    `Verdict: ${bestMatch.verdict}`,
    `Claim matched: ${bestMatch.claim}`,
    `Details: ${bestMatch.detail}`,
    `Source: ${bestMatch.source}`,
    `Confidence: ${(bestMatch.confidence * 100).toFixed(0)}%`,
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    // Extract the claim from the prompt
    const claimMatch = query.match(/claim:\s*(.*)/i) || query.match(/check.*?:\s*(.*)/i);
    const claim = claimMatch ? claimMatch[1].trim() : query;

    const output = lookUpFact(claim);
    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const claimsToCheck = [
    'Python was created by Guido van Rossum and first released in 1991.',
    'The Great Wall of China is visible from space with the naked eye.',
    'Lightning never strikes the same place twice.',
  ];

  for (const claim of claimsToCheck) {
    console.log(`\nChecking: ${claim}`);
    const result = await runtime.run(langchainAgent, `Please fact-check this claim: ${claim}`);
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
