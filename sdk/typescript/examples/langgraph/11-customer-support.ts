/**
 * Customer Support Router -- StateGraph with greet -> classify -> route -> respond.
 *
 * Demonstrates:
 *   - Multi-node StateGraph with conditional branching
 *   - Classifying user intent and routing to specialized handlers
 *   - Billing, technical, and general support branches
 *
 * In production you would use:
 *   import { StateGraph, START, END } from '@langchain/langgraph';
 *   builder.addConditionalEdges("classify", routeCategory, { ... });
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------
interface SupportState {
  user_message: string;
  greeting: string;
  category: 'billing' | 'technical' | 'general';
  response: string;
}

// ---------------------------------------------------------------------------
// Node functions
// ---------------------------------------------------------------------------
function greet(_state: SupportState): Partial<SupportState> {
  return {
    greeting:
      'Hello! Thank you for contacting our support team. ' +
      "I'm here to help you today.",
  };
}

function classify(state: SupportState): Partial<SupportState> {
  const msg = state.user_message.toLowerCase();
  let category: SupportState['category'];

  if (
    msg.includes('charged') ||
    msg.includes('billing') ||
    msg.includes('refund') ||
    msg.includes('payment') ||
    msg.includes('invoice')
  ) {
    category = 'billing';
  } else if (
    msg.includes('error') ||
    msg.includes('bug') ||
    msg.includes('crash') ||
    msg.includes('not working') ||
    msg.includes('technical')
  ) {
    category = 'technical';
  } else {
    category = 'general';
  }

  return { category };
}

function routeCategory(state: SupportState): string {
  return state.category;
}

function handleBilling(state: SupportState): Partial<SupportState> {
  return {
    response:
      `${state.greeting}\n\n` +
      `I can see you have a billing concern. I'd be happy to review your account ` +
      `and help resolve this. For the double charge you mentioned, I can initiate ` +
      `a refund process right away. Our billing team typically processes refunds ` +
      `within 3-5 business days. Is there anything else I can help with?`,
  };
}

function handleTechnical(state: SupportState): Partial<SupportState> {
  return {
    response:
      `${state.greeting}\n\n` +
      `I understand you're experiencing a technical issue. Let me help you ` +
      `troubleshoot this step by step:\n` +
      `1. Try clearing your browser cache and cookies\n` +
      `2. Restart the application\n` +
      `3. Check if the issue persists in an incognito window\n` +
      `If the problem continues, I can escalate to our engineering team.`,
  };
}

function handleGeneral(state: SupportState): Partial<SupportState> {
  return {
    response:
      `${state.greeting}\n\n` +
      `Thank you for reaching out! I'd be happy to help with your inquiry. ` +
      `Could you provide a bit more detail so I can assist you better? ` +
      `Our team is available 24/7 to help with any questions you may have.`,
  };
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'customer_support',

  invoke: async (input: Record<string, unknown>) => {
    const userMessage = (input.input as string) ?? '';
    let state: SupportState = {
      user_message: userMessage,
      greeting: '',
      category: 'general',
      response: '',
    };

    state = { ...state, ...greet(state) };
    state = { ...state, ...classify(state) };

    const handlers: Record<string, (s: SupportState) => Partial<SupportState>> = {
      billing: handleBilling,
      technical: handleTechnical,
      general: handleGeneral,
    };
    state = { ...state, ...handlers[state.category](state) };

    return { output: state.response };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['greet', {}],
      ['classify', {}],
      ['billing', {}],
      ['technical', {}],
      ['general', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'greet'],
      ['greet', 'classify'],
      // Conditional: classify -> billing | technical | general
      ['billing', '__end__'],
      ['technical', '__end__'],
      ['general', '__end__'],
    ],
  }),

  nodes: new Map([
    ['greet', {}],
    ['classify', {}],
    ['billing', {}],
    ['technical', {}],
    ['general', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const userMessage = (input.input as string) ?? '';
    let state: SupportState = {
      user_message: userMessage,
      greeting: '',
      category: 'general',
      response: '',
    };

    state = { ...state, ...greet(state) };
    yield ['updates', { greet: { greeting: state.greeting } }];

    state = { ...state, ...classify(state) };
    yield ['updates', { classify: { category: state.category } }];

    const handlers: Record<string, (s: SupportState) => Partial<SupportState>> = {
      billing: handleBilling,
      technical: handleTechnical,
      general: handleGeneral,
    };
    state = { ...state, ...handlers[state.category](state) };
    yield ['updates', { [state.category]: { response: state.response } }];

    yield ['values', { output: state.response }];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      graph,
      'I was charged twice for my subscription this month and need a refund.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
