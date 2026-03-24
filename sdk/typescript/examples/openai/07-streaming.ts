// Copyright (c) 2025 Agentspan
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * OpenAI Agent with Streaming -- real-time event streaming.
 *
 * Demonstrates:
 *   - Streaming events from an OpenAI agent
 *   - Processing different event types (agent updates, raw model events, item events)
 *   - Running natively and via Agentspan passthrough
 *
 * Requirements:
 *   - OPENAI_API_KEY for the native path
 *   - AGENTSPAN_SERVER_URL for the Agentspan path
 */

import {
  Agent,
  run,
  tool,
  setTracingDisabled,
  RunAgentUpdatedStreamEvent,
  RunRawModelStreamEvent,
  RunItemStreamEvent,
} from '@openai/agents';
import { z } from 'zod';
import { AgentRuntime } from '@agentspan/sdk';

setTracingDisabled(true);

// ── Tool ────────────────────────────────────────────────────────────

const searchKnowledgeBase = tool({
  name: 'search_knowledge_base',
  description: 'Search the knowledge base for relevant information.',
  parameters: z.object({ query: z.string().describe('Search query') }),
  execute: async ({ query }) => {
    const knowledge: Record<string, string> = {
      'return policy':
        'Returns accepted within 30 days with receipt. Electronics have a 15-day return window.',
      shipping:
        'Free shipping on orders over $50. Standard delivery: 3-5 business days.',
      warranty:
        'All products come with a 1-year manufacturer warranty. Extended warranty available for electronics.',
    };
    const queryLower = query.toLowerCase();
    for (const [key, value] of Object.entries(knowledge)) {
      if (queryLower.includes(key)) return value;
    }
    return 'No relevant information found for your query.';
  },
});

// ── Agent ───────────────────────────────────────────────────────────

const agent = new Agent({
  name: 'support_agent',
  instructions:
    'You are a customer support agent. Use the knowledge base to answer ' +
    'questions accurately. If you cannot find the answer, say so honestly.',
  model: 'gpt-4o-mini',
  tools: [searchKnowledgeBase],
});

const prompt = "What's your return policy for electronics?";

// ── Path 1: Native OpenAI Agents SDK streaming ─────────────────────
console.log('=== Path 1: Native OpenAI Agents SDK (Streaming) ===\n');
try {
  const stream = await run(agent, prompt, { stream: true });
  console.log('Streaming events:');
  for await (const event of stream) {
    if (event instanceof RunAgentUpdatedStreamEvent) {
      console.log(`  [agent_updated] Agent: ${event.agent.name}`);
    } else if (event instanceof RunItemStreamEvent) {
      const item = event.item;
      if (item.type === 'tool_call_item') {
        console.log(`  [tool_call] ${(item as any).name ?? 'tool'}`);
      } else if (item.type === 'tool_call_output_item') {
        console.log(`  [tool_output] ${String((item as any).output).slice(0, 80)}`);
      } else if (item.type === 'message_output_item') {
        console.log(`  [message] ${String((item as any).content).slice(0, 80)}`);
      }
    } else if (event instanceof RunRawModelStreamEvent) {
      // Raw model events contain token-level data; log sparingly
      const data = event.data as any;
      if (data?.type === 'response.output_text.delta') {
        process.stdout.write(data.delta ?? '');
      }
    }
  }
  console.log('\n\nFinal output:', stream.finalOutput);
} catch (err: any) {
  console.log('Native path error (need OPENAI_API_KEY):', err.message);
}

// ── Path 2: Agentspan passthrough ──────────────────────────────────
console.log('\n=== Path 2: Agentspan Passthrough ===\n');
const runtime = new AgentRuntime();
try {
  const agentspanResult = await runtime.run(agent, prompt);
  console.log('Agentspan output:', agentspanResult.output);
} catch (err: any) {
  console.log('Agentspan path error (need AGENTSPAN_SERVER_URL):', err.message);
} finally {
  await runtime.shutdown();
}
