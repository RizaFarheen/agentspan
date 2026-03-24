/**
 * Translation Agent -- multilingual translation with quality assessment.
 *
 * Demonstrates:
 *   - Language detection
 *   - Translation with cultural adaptation
 *   - Back-translation quality check
 *   - Practical use case: localization pipeline for content
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

const SUPPORTED_LANGUAGES: Record<string, string> = {
  spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', japanese: 'ja', chinese: 'zh', korean: 'ko',
  arabic: 'ar', russian: 'ru', dutch: 'nl', swedish: 'sv', english: 'en',
};

function detectLanguage(text: string): string {
  // Simple heuristic: check for common words
  if (/\b(the|is|and|of|to)\b/i.test(text)) return 'Detected language: English';
  if (/\b(el|la|los|las|de|en|que)\b/i.test(text)) return 'Detected language: Spanish';
  if (/\b(le|la|les|de|en|et|est)\b/i.test(text)) return 'Detected language: French';
  return 'Detected language: English';
}

function translateText(text: string, targetLanguage: string): string {
  // Mock translations
  const translations: Record<string, Record<string, string>> = {
    spanish: {
      'Innovation distinguishes between a leader and a follower.':
        'La innovacion distingue entre un lider y un seguidor.',
      'The best way to predict the future is to create it.':
        'La mejor manera de predecir el futuro es crearlo.',
    },
  };

  const langTranslations = translations[targetLanguage.toLowerCase()];
  if (langTranslations) {
    for (const [original, translated] of Object.entries(langTranslations)) {
      if (text.includes(original)) {
        return `[${targetLanguage}] ${translated}`;
      }
    }
  }

  return `[${targetLanguage}] (Mock translation of: "${text.slice(0, 60)}...")`;
}

function backTranslateCheck(original: string, translation: string, translatedLanguage: string): string {
  return [
    `Back-translation: ${original}`,
    'Quality assessment: Excellent -- the back-translation preserves the original meaning faithfully. ' +
      'No significant semantic changes detected.',
  ].join('\n');
}

function culturalAdaptation(text: string, targetCulture: string): string {
  return [
    `[Cultural Adaptation for ${targetCulture}]`,
    `Adapted text considers ${targetCulture} conventions for formality, idioms, and cultural references.`,
    `Key adaptations: adjusted formality level, replaced culture-specific idioms with local equivalents.`,
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const parts: string[] = [];

    // Detect source language
    parts.push(detectLanguage(query));

    // Translate
    const textMatch = query.match(/'([^']+)'/g);
    if (textMatch) {
      for (const quoted of textMatch) {
        const text = quoted.replace(/'/g, '');
        const translation = translateText(text, 'Spanish');
        parts.push(translation);
        parts.push(backTranslateCheck(text, translation, 'Spanish'));
      }
    }

    const output = parts.length > 1
      ? parts.join('\n\n')
      : 'Please provide text to translate and specify the target language.';

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running translation agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    "Translate the following to Spanish and verify the quality: " +
      "'Innovation distinguishes between a leader and a follower. " +
      "The best way to predict the future is to create it.'",
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
