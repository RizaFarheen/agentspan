/**
 * Multi-Turn Conversation -- MemorySaver + session_id for continuity.
 *
 * Demonstrates:
 *   - Using MemorySaver checkpointer for persistent conversation history
 *   - Passing sessionId to runtime.run for scoped memory
 *   - How different session IDs maintain separate conversation threads
 *   - Practical use case: interview preparation assistant
 *
 * In production you would use:
 *   import { MemorySaver } from '@langchain/langgraph';
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock in-memory checkpointer (simulates MemorySaver)
// ---------------------------------------------------------------------------
const sessions: Record<string, Array<{ role: string; content: string }>> = {};

const SYSTEM_PROMPT =
  'You are an interview preparation coach. ' +
  'Remember what the user tells you about their background, skills, and target role. ' +
  'Build on previous messages to give increasingly personalized advice.';

const graph = {
  name: 'interview_coach',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>, config?: Record<string, unknown>) => {
    const threadId =
      (config?.configurable as Record<string, unknown>)?.thread_id as string | undefined;
    const sessionKey = threadId ?? 'default';
    const userMsg =
      Array.isArray(input.messages) && input.messages.length > 0
        ? ((input.messages[0] as Record<string, unknown>).content as string)
        : String(input.input ?? '');

    if (!sessions[sessionKey]) {
      sessions[sessionKey] = [];
    }
    sessions[sessionKey].push({ role: 'user', content: userMsg });

    // Generate contextual response based on session history
    const history = sessions[sessionKey];
    let response: string;

    const hasPythonBg = history.some(
      (m) => m.role === 'user' && /python/i.test(m.content),
    );
    const hasBackendRole = history.some(
      (m) => m.role === 'user' && /backend engineer/i.test(m.content),
    );
    const hasPMRole = history.some(
      (m) => m.role === 'user' && /product manager/i.test(m.content),
    );
    const hasMarketingBg = history.some(
      (m) => m.role === 'user' && /marketing/i.test(m.content),
    );

    if (/technical topics|review/i.test(userMsg) && hasBackendRole && hasPythonBg) {
      response =
        'Given your 5 years of Python experience and target role as a senior backend ' +
        'engineer at a fintech startup, I recommend reviewing: system design (especially ' +
        'payment processing architectures), distributed systems, API design, database ' +
        'optimization, and Python concurrency patterns (asyncio, threading).';
    } else if (/skills gap/i.test(userMsg) && hasPMRole && hasMarketingBg) {
      response =
        'With your marketing background transitioning to product management, focus on: ' +
        '1) Technical literacy (SQL basics, reading PRDs), 2) Data analysis skills, ' +
        '3) Agile/Scrum methodology, and 4) User story writing. Your marketing ' +
        'experience with customer insights is actually a strong advantage!';
    } else if (hasBackendRole) {
      response =
        "Great background for a senior backend role! With 5 years of Python, you're " +
        'well-positioned. I recommend preparing for system design interviews and ' +
        'brushing up on algorithms. What specific areas concern you most?';
    } else if (hasPMRole) {
      response =
        'Transitioning from marketing to product management is a well-trodden path! ' +
        'Your customer-facing experience is valuable. Focus on building technical ' +
        'literacy and framework knowledge (RICE, MoSCoW). Shall we practice case studies?';
    } else {
      response = `Great to hear about your goals! Tell me more about your background and target role so I can give personalized advice.`;
    }

    sessions[sessionKey].push({ role: 'assistant', content: response });

    return {
      messages: sessions[sessionKey].map((m) => ({ role: m.role, content: m.content })),
    };
  },

  getGraph: () => ({
    nodes: new Map([['__start__', {}], ['agent', {}], ['__end__', {}]]),
    edges: [['__start__', 'agent'], ['agent', '__end__']],
  }),

  nodes: new Map([['agent', {}]]),

  stream: async function* (input: Record<string, unknown>, config?: Record<string, unknown>) {
    const result = await graph.invoke(input, config);
    const lastMsg = result.messages[result.messages.length - 1];
    yield ['updates', { agent: { messages: [lastMsg] } }];
    yield ['values', result];
  },
};

// ---------------------------------------------------------------------------
// Run multi-turn with separate sessions
// ---------------------------------------------------------------------------
async function main() {
  const SESSION_A = 'candidate-alice';
  const SESSION_B = 'candidate-bob';

  const runtime = new AgentRuntime();
  try {
    console.log("=== Alice's session ===");
    let r = await runtime.run(
      graph,
      "I'm applying for a senior backend engineer role at a fintech startup. I have 5 years of Python experience.",
      { sessionId: SESSION_A },
    );
    r.printResult();

    console.log("\n=== Bob's session (separate memory) ===");
    r = await runtime.run(
      graph,
      'I want to become a product manager. I have a marketing background.',
      { sessionId: SESSION_B },
    );
    r.printResult();

    console.log("\n=== Alice's session -- follow-up (remembers context) ===");
    r = await runtime.run(
      graph,
      'What technical topics should I review for my upcoming interviews?',
      { sessionId: SESSION_A },
    );
    r.printResult();

    console.log("\n=== Bob's session -- follow-up (remembers context) ===");
    r = await runtime.run(
      graph,
      'What skills gap should I address first?',
      { sessionId: SESSION_B },
    );
    r.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
