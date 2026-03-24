/**
 * Memory Agent -- agent with persistent user profile memory.
 *
 * Demonstrates:
 *   - In-memory user profile store keyed by session_id
 *   - Tools to save and retrieve user preferences
 *   - Personalized responses based on remembered user data
 *   - Practical use case: personalized assistant that adapts to each user
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- In-memory user profile store --
const userProfiles: Record<string, Record<string, string>> = {};

function savePreference(userId: string, key: string, value: string): string {
  if (!userProfiles[userId]) userProfiles[userId] = {};
  userProfiles[userId][key] = value;
  return `Saved preference for user ${userId}: ${key} = ${value}`;
}

function getPreference(userId: string, key: string): string {
  const profile = userProfiles[userId];
  if (!profile || !profile[key]) {
    return `No preference '${key}' found for user ${userId}`;
  }
  return `User ${userId} preference '${key}': ${profile[key]}`;
}

function getFullProfile(userId: string): string {
  const profile = userProfiles[userId];
  if (!profile || Object.keys(profile).length === 0) {
    return `No profile data found for user ${userId}`;
  }
  const items = Object.entries(profile).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  return `Profile for ${userId}:\n${items}`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;
    const parts: string[] = [];

    // Simulate tool calls based on intent
    const userIdMatch = query.match(/user[- ]?(?:ID is |id is )?(\S+)/i);
    const userId = userIdMatch ? userIdMatch[1].replace(/[.,]$/, '') : 'user-42';

    if (query.toLowerCase().includes('save') || query.toLowerCase().includes('my name is')) {
      if (query.toLowerCase().includes('name')) {
        const nameMatch = query.match(/name is (\w+)/i);
        if (nameMatch) parts.push(savePreference(userId, 'name', nameMatch[1]));
      }
      if (query.toLowerCase().includes('python')) {
        parts.push(savePreference(userId, 'language', 'Python'));
      }
      if (query.toLowerCase().includes('timezone')) {
        const tzMatch = query.match(/timezone is (\S+)/i);
        if (tzMatch) parts.push(savePreference(userId, 'timezone', tzMatch[1]));
      }
    }

    if (query.toLowerCase().includes('what do you know') || query.toLowerCase().includes('profile')) {
      parts.push(getFullProfile(userId));
    }

    const output = parts.length > 0 ? parts.join('\n') : `Processed request for user ${userId}.`;
    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();
  const userId = 'user-42';

  const interactions = [
    `My user ID is ${userId}. Please save that my name is Jordan and I prefer Python.`,
    `For user ${userId}, also save that my timezone is US/Pacific.`,
    `What do you know about user ${userId}?`,
  ];

  for (const msg of interactions) {
    console.log(`\nUser: ${msg}`);
    const result = await runtime.run(langchainAgent, msg);
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
