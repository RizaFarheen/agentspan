/**
 * Sentiment Analysis -- batch sentiment analysis with aspect-based scoring.
 *
 * Demonstrates:
 *   - Overall sentiment classification (positive/negative/neutral)
 *   - Aspect-based sentiment analysis (extracting specific dimensions)
 *   - Key phrase extraction driving sentiment
 *   - Practical use case: product review analysis pipeline
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Tool definitions ─────────────────────────────────────

const classifySentiment = new DynamicStructuredTool({
  name: 'classify_sentiment',
  description: 'Classify the overall sentiment of a text as positive, negative, or neutral with a confidence score.',
  schema: z.object({
    text: z.string().describe('Text to analyze for sentiment'),
  }),
  func: async ({ text }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Classify the sentiment of this text.\n` +
        `Return format: SENTIMENT: [positive/negative/neutral] | CONFIDENCE: [0-100%] | REASON: [one sentence]\n\n` +
        `Text: ${text}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return content.trim();
  },
});

const aspectSentiment = new DynamicStructuredTool({
  name: 'aspect_sentiment',
  description: 'Perform aspect-based sentiment analysis on specific dimensions of a text.',
  schema: z.object({
    text: z.string().describe('Text to analyze'),
    aspects: z.string().describe("Comma-separated list of aspects to analyze (e.g., 'quality, price, delivery, support')"),
  }),
  func: async ({ text, aspects }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const aspectList = aspects.split(',').map((a) => a.trim());
    const response = await llm.invoke(
      `Analyze the sentiment for each of these aspects in the text.\n` +
        `Aspects: ${aspectList.join(', ')}\n` +
        `For each aspect, provide: aspect: [positive/negative/neutral/not_mentioned] - quote or reason\n\n` +
        `Text: ${text}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Aspect-based analysis:\n${content.trim()}`;
  },
});

const extractKeyPhrases = new DynamicStructuredTool({
  name: 'extract_key_phrases',
  description: 'Extract key phrases that drive the sentiment of a text.',
  schema: z.object({
    text: z.string().describe('Text to analyze'),
    sentiment_filter: z.string().optional().default('all').describe("Filter phrases by -- 'positive', 'negative', 'all'"),
  }),
  func: async ({ text, sentiment_filter }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    let filterInstruction = '';
    if (sentiment_filter === 'positive') {
      filterInstruction = 'Focus only on positive phrases.';
    } else if (sentiment_filter === 'negative') {
      filterInstruction = 'Focus only on negative phrases.';
    }

    const response = await llm.invoke(
      `Extract the key phrases that most strongly indicate sentiment from this text. ` +
        `${filterInstruction}\n` +
        `Return as a bulleted list with [+] for positive, [-] for negative phrases.\n\n` +
        `Text: ${text}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Key sentiment phrases:\n${content.trim()}`;
  },
});

const batchSentimentSummary = new DynamicStructuredTool({
  name: 'batch_sentiment_summary',
  description: "Analyze multiple reviews and produce an aggregate sentiment report. Reviews separated by '---' delimiter.",
  schema: z.object({
    reviews: z.string().describe("Reviews separated by '---' delimiter"),
  }),
  func: async ({ reviews }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const reviewList = reviews.split('---').map((r) => r.trim()).filter(Boolean);
    if (reviewList.length === 0) return 'No reviews to analyze.';

    const sentiments: string[] = [];
    for (const rev of reviewList) {
      const response = await llm.invoke(`Classify: positive, negative, or neutral. One word only.\n${rev}`);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      sentiments.push(content.trim().toLowerCase());
    }

    const pos = sentiments.filter((s) => s === 'positive').length;
    const neg = sentiments.filter((s) => s === 'negative').length;
    const neu = sentiments.filter((s) => s === 'neutral').length;
    const total = sentiments.length;

    const trend = pos > neg ? 'mostly positive' : neg > pos ? 'mostly negative' : 'mixed';
    return (
      `Batch Analysis (${total} reviews):\n` +
      `  Positive: ${pos} (${((pos / total) * 100).toFixed(0)}%)\n` +
      `  Negative: ${neg} (${((neg / total) * 100).toFixed(0)}%)\n` +
      `  Neutral:  ${neu} (${((neu / total) * 100).toFixed(0)}%)\n` +
      `  Overall trend: ${trend}`
    );
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [classifySentiment, aspectSentiment, extractKeyPhrases, batchSentimentSummary];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const SENTIMENT_SYSTEM = `You are a sentiment analysis expert.
For review analysis:
1. Start with overall sentiment classification
2. Perform aspect-based analysis for product reviews (quality, price, delivery, support)
3. Extract key positive and negative phrases
4. Provide actionable insights for the business`;

async function runSentimentAgent(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SENTIMENT_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 6; i++) {
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
    const output = await runSentimentAgent(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

const SAMPLE_REVIEW =
  "I bought the wireless headphones two weeks ago and I'm mostly happy. The sound quality " +
  "is absolutely incredible -- best I've heard at this price point. Battery life is great too, " +
  'lasting over 30 hours. However, the build quality feels a bit cheap for a $150 product and ' +
  'the ear cushions started peeling after just two weeks. Customer support was responsive and ' +
  'offered a replacement, which I appreciated.';

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      `Analyze this product review in detail:\n\n${SAMPLE_REVIEW}`
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
