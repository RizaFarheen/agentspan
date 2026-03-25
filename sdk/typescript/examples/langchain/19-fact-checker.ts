/**
 * Fact Checker -- agent that verifies factual claims against a knowledge base.
 *
 * Demonstrates:
 *   - Looking up claims against a curated fact database
 *   - Distinguishing between verified, unverified, and false claims
 *   - Providing sources and confidence scores
 *   - Practical use case: automated misinformation detection assistant
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Fact database ─────────────────────────────────────────

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
  shakespeare_hamlet: {
    claim: 'Shakespeare wrote Hamlet',
    verdict: 'TRUE',
    detail: 'Hamlet was written by William Shakespeare around 1600-1601.',
    source: 'Encyclopaedia Britannica',
    confidence: 0.99,
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
    detail: 'Lightning frequently strikes the same location multiple times. The Empire State Building is struck ~20-25 times per year.',
    source: 'NOAA Lightning Safety Program',
    confidence: 0.99,
  },
};

// ── Tool definitions ─────────────────────────────────────

const lookUpFact = new DynamicStructuredTool({
  name: 'look_up_fact',
  description: 'Look up a specific claim in the fact verification database. Searches by keywords.',
  schema: z.object({
    claim: z.string().describe('The specific claim to verify'),
  }),
  func: async ({ claim }) => {
    const claimLower = claim.toLowerCase();
    const claimWords = claimLower.split(/\s+/);
    const matches: [number, FactEntry][] = [];

    for (const fact of Object.values(FACT_DB)) {
      const factWords = fact.claim.toLowerCase().split(/\s+/);
      const overlap = factWords.filter((w) => claimWords.includes(w)).length;
      if (overlap >= 3) {
        matches.push([overlap, fact]);
      }
    }

    if (matches.length === 0) {
      return `No matching facts found for: '${claim}'. Cannot verify with current knowledge base.`;
    }

    matches.sort((a, b) => b[0] - a[0]);
    const fact = matches[0][1];
    return (
      `Verdict: ${fact.verdict}\n` +
      `Claim matched: ${fact.claim}\n` +
      `Details: ${fact.detail}\n` +
      `Source: ${fact.source}\n` +
      `Confidence: ${(fact.confidence * 100).toFixed(0)}%`
    );
  },
});

const checkMultipleClaims = new DynamicStructuredTool({
  name: 'check_multiple_claims',
  description: 'Verify multiple claims at once. Provide claims separated by pipe (|) or newline.',
  schema: z.object({
    claims: z.string().describe('Pipe-separated or newline-separated list of claims to check'),
  }),
  func: async ({ claims }) => {
    const claimList = claims.includes('|')
      ? claims.split('|').map((c) => c.trim()).filter(Boolean)
      : claims.split('\n').map((c) => c.trim()).filter(Boolean);

    const results: string[] = [];
    for (let i = 0; i < claimList.length; i++) {
      const result = await lookUpFact.invoke({ claim: claimList[i] });
      results.push(`Claim ${i + 1}: "${claimList[i]}"\n${result}`);
    }
    return results.join('\n\n');
  },
});

const assessClaimPlausibility = new DynamicStructuredTool({
  name: 'assess_claim_plausibility',
  description: 'Use LLM reasoning to assess the plausibility of a claim not in the database.',
  schema: z.object({
    claim: z.string().describe('The claim to assess for plausibility'),
  }),
  func: async ({ claim }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Assess the factual plausibility of this claim: '${claim}'\n\n` +
        'Consider: Is this consistent with established science/history/facts? ' +
        'Rate confidence as: HIGH, MEDIUM, or LOW. ' +
        'Provide a brief assessment (2-3 sentences) and note any important caveats.'
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `[Plausibility Assessment]\n${content.trim()}\n(Note: This is LLM reasoning, not verified data)`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [lookUpFact, checkMultipleClaims, assessClaimPlausibility];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const FACT_CHECKER_SYSTEM = `You are a rigorous fact-checking assistant.
When checking facts:
1. Always look up specific claims in the database first
2. For multiple claims, use check_multiple_claims for efficiency
3. If a claim is not in the database, use plausibility assessment with a clear disclaimer
4. Give a clear final verdict: VERIFIED TRUE / VERIFIED FALSE / UNVERIFIED
5. Always cite your sources`;

async function runFactChecker(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(FACT_CHECKER_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 5; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    for (const tc of toolCalls) {
      const tool = toolMap[tc.name];
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        messages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      }
    }
  }

  return 'Agent reached maximum iterations.';
}

// ── Wrap for Agentspan ───────────────────────────────────

const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    const output = await runFactChecker(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

async function main() {
  const claimsToCheck = [
    'Python was created by Guido van Rossum and first released in 1991.',
    'The Great Wall of China is visible from space with the naked eye.',
    'Lightning never strikes the same place twice.',
  ];

  const runtime = new AgentRuntime();
  try {
    for (const claim of claimsToCheck) {
      console.log(`\nChecking: ${claim}`);
      const result = await runtime.run(agentRunnable, `Please fact-check this claim: ${claim}`);
      result.printResult();
      console.log('-'.repeat(60));
    }
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
