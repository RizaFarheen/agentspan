/**
 * Translation Agent -- multilingual translation with quality assessment.
 *
 * Demonstrates:
 *   - Language detection
 *   - Translation with cultural adaptation
 *   - Back-translation quality check
 *   - Practical use case: localization pipeline for content
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Tool definitions ─────────────────────────────────────

const detectLanguage = new DynamicStructuredTool({
  name: 'detect_language',
  description: 'Detect the language of the given text.',
  schema: z.object({
    text: z.string().describe('Text whose language should be detected'),
  }),
  func: async ({ text }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Identify the language of this text. Return only the language name in English ` +
        `(e.g., 'English', 'Spanish', 'French'): '${text}'`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Detected language: ${content.trim()}`;
  },
});

const translateText = new DynamicStructuredTool({
  name: 'translate_text',
  description: 'Translate text to the target language.',
  schema: z.object({
    text: z.string().describe('Text to translate'),
    target_language: z.string().describe("Target language name (e.g., 'Spanish', 'French', 'Japanese')"),
    preserve_tone: z.boolean().optional().default(true).describe('Whether to preserve the original tone/formality level'),
  }),
  func: async ({ text, target_language, preserve_tone }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const toneInstruction = preserve_tone
      ? 'Preserve the original tone, formality, and style.'
      : "Adapt naturally to the target language's conventions.";
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are a professional translator. Translate to ${target_language}. ${toneInstruction} Return only the translation.`],
      ['human', '{text}'],
    ]);
    const chain = prompt.pipe(llm);
    const response = await chain.invoke({ text });
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `[${target_language}] ${content.trim()}`;
  },
});

const backTranslateCheck = new DynamicStructuredTool({
  name: 'back_translate_check',
  description: 'Verify translation quality by translating back to English and comparing.',
  schema: z.object({
    original: z.string().describe('The original English text'),
    translation: z.string().describe('The translation to verify'),
    translated_language: z.string().describe('The language the text was translated to'),
  }),
  func: async ({ original, translation, translated_language }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

    // Translate back to English
    const backResponse = await llm.invoke(
      `Translate this ${translated_language} text back to English exactly:\n${translation}`
    );
    const backTranslated = typeof backResponse.content === 'string'
      ? backResponse.content.trim()
      : JSON.stringify(backResponse.content);

    // Compare semantic similarity
    const comparison = await llm.invoke(
      `Compare these two English texts for semantic similarity.\n` +
        `Original: ${original}\n` +
        `Back-translated: ${backTranslated}\n\n` +
        `Rate similarity as: Excellent / Good / Acceptable / Poor. ` +
        `Note any significant meaning changes in one sentence.`
    );
    const compContent = typeof comparison.content === 'string'
      ? comparison.content.trim()
      : JSON.stringify(comparison.content);

    return `Back-translation: ${backTranslated}\nQuality assessment: ${compContent}`;
  },
});

const culturalAdaptation = new DynamicStructuredTool({
  name: 'cultural_adaptation',
  description: 'Adapt text for a specific culture, going beyond literal translation.',
  schema: z.object({
    text: z.string().describe('English text to culturally adapt'),
    target_culture: z.string().describe("Target culture/region (e.g., 'Japanese business', 'Latin American informal')"),
  }),
  func: async ({ text, target_culture }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Adapt this text for ${target_culture} audiences. ` +
        `Consider: idioms, formality levels, cultural references, and local conventions. ` +
        `Explain key adaptations made.\n\nText: ${text}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `[Cultural Adaptation for ${target_culture}]\n${content.trim()}`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [detectLanguage, translateText, backTranslateCheck, culturalAdaptation];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const TRANSLATION_SYSTEM = `You are a professional multilingual translation assistant.
For translation requests:
1. Detect the source language if not specified
2. Translate to the requested target language
3. Perform a back-translation quality check for important content
4. Note any cultural nuances that may affect accuracy
Always prioritize meaning fidelity over word-for-word accuracy.`;

async function runTranslationAgent(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(TRANSLATION_SYSTEM),
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
    const output = await runTranslationAgent(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      "Translate the following to Spanish and verify the quality: " +
        "'Innovation distinguishes between a leader and a follower. " +
        "The best way to predict the future is to create it.'"
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
