/**
 * Output Parsers -- using LangChain output parsers inside tool functions.
 *
 * Demonstrates:
 *   - StrOutputParser for clean string extraction
 *   - CommaSeparatedListOutputParser for list output
 *   - Structured JSON extraction via withStructuredOutput + Zod
 *   - How output parsers improve reliability of LLM-structured data
 *   - Practical use case: structured data extraction pipeline
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser, CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Parsers ──────────────────────────────────────────────

const strParser = new StringOutputParser();
const listParser = new CommaSeparatedListOutputParser();

// Zod schema for structured product review extraction
const ProductReviewSchema = z.object({
  product_name: z.string().describe('Name of the product'),
  overall_score: z.number().describe('Overall score from 1-10'),
  pros: z.array(z.string()).describe('List of positive aspects'),
  cons: z.array(z.string()).describe('List of negative aspects'),
  recommendation: z.string().describe('Buy/Skip/Wait recommendation'),
});

// ── Tool definitions ─────────────────────────────────────

const extractKeywordsList = new DynamicStructuredTool({
  name: 'extract_keywords_list',
  description: 'Extract keywords from text as a clean comma-separated list using CommaSeparatedListOutputParser.',
  schema: z.object({
    text: z.string().describe('Text to extract keywords from'),
    max_keywords: z.number().optional().default(10).describe('Maximum number of keywords to return'),
  }),
  func: async ({ text, max_keywords }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const formatInstructions = listParser.getFormatInstructions();
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Extract the ${max_keywords} most important keywords from the text. ${formatInstructions}`],
      ['human', '{text}'],
    ]);
    const chain = prompt.pipe(llm).pipe(listParser);
    const keywords = await chain.invoke({ text });
    return `Keywords: ${keywords.slice(0, max_keywords).join(', ')}`;
  },
});

const cleanTextExtraction = new DynamicStructuredTool({
  name: 'clean_text_extraction',
  description: 'Apply a transformation instruction to text and return a clean string result using StrOutputParser.',
  schema: z.object({
    text: z.string().describe('Input text to transform'),
    instruction: z.string().describe("Transformation instruction (e.g., 'extract the main question', 'rephrase formally')"),
  }),
  func: async ({ text, instruction }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'Follow the instruction precisely. Return only the result, no explanation.'],
      ['human', 'Instruction: {instruction}\n\nText: {text}'],
    ]);
    const chain = prompt.pipe(llm).pipe(strParser);
    const result = await chain.invoke({ text, instruction });
    return result.trim();
  },
});

const parseProductReview = new DynamicStructuredTool({
  name: 'parse_product_review',
  description: 'Parse a product review into structured fields: score, pros, cons, and recommendation.',
  schema: z.object({
    review_text: z.string().describe('The full review text to parse'),
    product_name: z.string().describe('Name of the product being reviewed'),
  }),
  func: async ({ review_text, product_name }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const structuredLlm = llm.withStructuredOutput(ProductReviewSchema);
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Parse the review for '${product_name}' into structured data with product_name, overall_score (1-10), pros, cons, and recommendation (Buy/Skip/Wait).`],
      ['human', '{review}'],
    ]);
    const chain = prompt.pipe(structuredLlm);

    try {
      const result = await chain.invoke({ review: review_text });
      const prosStr = result.pros.map((p: string) => `  + ${p}`).join('\n');
      const consStr = result.cons.map((c: string) => `  - ${c}`).join('\n');
      return (
        `Parsed review for ${result.product_name}:\n` +
        `Score: ${result.overall_score}/10\n` +
        `Pros:\n${prosStr}\n` +
        `Cons:\n${consStr}\n` +
        `Recommendation: ${result.recommendation}`
      );
    } catch (e) {
      return `Parse error: ${e}`;
    }
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [extractKeywordsList, cleanTextExtraction, parseProductReview];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const PARSER_SYSTEM = `You are a text processing assistant.
When processing text:
1. Use appropriate parsers for each task (keyword extraction, clean text, structured reviews)
2. Apply transformations as requested
3. Present results clearly and consistently`;

async function runOutputParsersAgent(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(PARSER_SYSTEM),
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
    const output = await runOutputParsersAgent(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

const SAMPLE_REVIEW = `I've been using the Sony WH-1000XM5 headphones for three months and have mixed feelings.
The noise cancellation is absolutely world-class -- I can work in a busy coffee shop without
any distraction. Sound quality is superb with rich bass and clear highs. Battery life is
fantastic at 30+ hours.

However, the build quality is disappointingly plasticky for a $400 headphone. The case is
bulky and the touch controls are overly sensitive. The microphone quality is mediocre for
calls. Overall I'd give it a 7.5/10 -- great for music listening but not ideal for the price.`;

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      `Extract keywords and parse the structured review from this text:\n\n${SAMPLE_REVIEW}\n\n` +
        'Product name: Sony WH-1000XM5'
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
