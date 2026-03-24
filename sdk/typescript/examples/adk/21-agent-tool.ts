/**
 * Google ADK AgentTool -- agent-as-tool invocation.
 *
 * Demonstrates:
 *   - Using AgentTool to wrap an agent as a callable tool
 *   - The parent agent's LLM invokes the child agent like a function
 *   - Unlike sub_agents (handoff), AgentTool runs inline and returns
 *
 * Requirements:
 *   - Conductor server with AgentTool support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Child agent tools -----------------------------------------------------

function searchKnowledgeBase(query: string): Record<string, unknown> {
  const data: Record<string, Record<string, unknown>> = {
    python: {
      summary: 'Python is a high-level programming language created by Guido van Rossum in 1991.',
      popularity: 'Most popular language on TIOBE index (2024)',
      key_use_cases: ['web development', 'data science', 'AI/ML', 'automation'],
    },
    rust: {
      summary: 'Rust is a systems programming language focused on safety and performance.',
      popularity: 'Most admired language on Stack Overflow survey (2024)',
      key_use_cases: ['systems programming', 'WebAssembly', 'CLI tools', 'embedded'],
    },
  };
  for (const [key, val] of Object.entries(data)) {
    if (query.toLowerCase().includes(key)) {
      return { query, found: true, ...val };
    }
  }
  return { query, found: false, summary: 'No results found.' };
}

function compute(expression: string): Record<string, unknown> {
  const allowed = new Set('0123456789+-*/.(). '.split(''));
  if (![...expression].every((c) => allowed.has(c))) {
    return { expression, error: 'Invalid expression' };
  }
  try {
    const fn = new Function(`return (${expression});`);
    return { expression, result: fn() };
  } catch (e) {
    return { expression, error: String(e) };
  }
}

// -- Child agents ----------------------------------------------------------

const researcher = {
  run: async (prompt: string) => ({ output: `Research: ${prompt}` }),
  model: llmModel, name: 'researcher',
  instruction: 'You are a research assistant. Use the knowledge base tool to find information and provide concise, factual answers.',
  tools: [
    { name: 'search_knowledge_base', description: 'Search an internal knowledge base for information.', fn: searchKnowledgeBase, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  ],
  _google_adk: true,
};

const calculator = {
  run: async (prompt: string) => ({ output: `Calc: ${prompt}` }),
  model: llmModel, name: 'calculator',
  instruction: 'You are a math assistant. Use the compute tool for calculations.',
  tools: [
    { name: 'compute', description: 'Evaluate a mathematical expression.', fn: compute, parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
  ],
  _google_adk: true,
};

// -- Parent agent with AgentTool wrappers ---------------------------------

const manager = {
  run: async (prompt: string) => ({ output: `Manager: ${prompt}` }),
  model: llmModel, name: 'manager',
  instruction:
    "You are a manager agent. You have two specialist agents available as tools:\n" +
    "- researcher: for looking up information\n" +
    "- calculator: for math computations\n\n" +
    "Use the appropriate agent tool to answer the user's question. " +
    "You can call multiple agent tools if needed.",
  tools: [
    { name: 'researcher', description: 'Research agent for looking up information.', agent: researcher },
    { name: 'calculator', description: 'Calculator agent for math computations.', agent: calculator },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    manager,
    'Look up information about Python and Rust, then calculate ' +
      "what percentage of Python's 4 key use cases overlap with Rust's 4 use cases.",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
