/**
 * Software Bug Assistant -- agent_tool + mcp_tool for bug triage.
 *
 * Mirrors the pattern from google/adk-samples/software-bug-assistant.
 * Demonstrates:
 *   - agent_tool wrapping a search sub-agent
 *   - Local ticket CRUD (in-memory store)
 *   - Cross-referencing with search results
 *
 * Requirements:
 *   - Conductor server with AgentTool support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- In-memory ticket store ------------------------------------------------

const tickets: Record<string, Record<string, unknown>> = {
  'COND-001': {
    id: 'COND-001',
    title: 'TaskStatusListener not invoked for system task lifecycle transitions',
    status: 'open',
    priority: 'high',
    github_issue: 847,
    description: 'TaskStatusListener notifications are only fully wired for worker tasks.',
    created: '2026-03-10',
  },
  'COND-002': {
    id: 'COND-002',
    title: 'Support reasonForIncompletion in fail_task event handlers',
    status: 'open',
    priority: 'medium',
    github_issue: 858,
    description: 'When an event handler uses action: fail_task, there is no way to set reasonForIncompletion.',
    created: '2026-03-13',
  },
  'COND-003': {
    id: 'COND-003',
    title: 'Optimize /workflowDefs page: paginate latest-versions API',
    status: 'open',
    priority: 'medium',
    github_issue: 781,
    description: 'The UI /workflowDefs page calls GET /metadata/workflow which returns all versions.',
    created: '2026-02-18',
  },
};

let nextId = 4;

// -- Tools -----------------------------------------------------------------

function getCurrentDate(): Record<string, unknown> {
  return { date: new Date().toISOString().slice(0, 10) };
}

function searchTickets(query: string): Record<string, unknown> {
  const queryLower = query.toLowerCase();
  const matches = Object.values(tickets).filter(
    (t) =>
      (t.title as string).toLowerCase().includes(queryLower) ||
      (t.description as string).toLowerCase().includes(queryLower),
  );
  return { query, count: matches.length, tickets: matches };
}

function createTicket(title: string, description: string, priority: string = 'medium'): Record<string, unknown> {
  const ticketId = `COND-${String(nextId++).padStart(3, '0')}`;
  const ticket = {
    id: ticketId,
    title,
    status: 'open',
    priority,
    description,
    created: new Date().toISOString().slice(0, 10),
  };
  tickets[ticketId] = ticket;
  return { created: true, ticket };
}

function updateTicket(ticketId: string, status: string = '', priority: string = ''): Record<string, unknown> {
  const ticket = tickets[ticketId.toUpperCase()];
  if (!ticket) return { error: `Ticket ${ticketId} not found` };
  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;
  return { updated: true, ticket };
}

function searchWeb(query: string): Record<string, unknown> {
  const results: Record<string, Record<string, string>> = {
    'task status listener': {
      source: 'Conductor Docs',
      answer: 'TaskStatusListener is only wired for SIMPLE tasks. System tasks bypass the listener.',
    },
    'do_while loop': {
      source: 'GitHub PR #820',
      answer: 'DO_WHILE tasks with items now pass validation without loopCondition.',
    },
    'event handler fail': {
      source: 'GitHub Issue #858',
      answer: 'Event handlers with action: fail_task cannot set reasonForIncompletion.',
    },
    'workflow def pagination': {
      source: 'GitHub Issue #781',
      answer: 'The /metadata/workflow endpoint returns all versions causing slow UI loads.',
    },
  };
  const queryLower = query.toLowerCase();
  for (const [key, val] of Object.entries(results)) {
    if (queryLower.includes(key)) return { query, found: true, ...val };
  }
  return { query, found: false, summary: 'No specific results found.' };
}

// -- Search sub-agent (wrapped as agent tool) -----------------------------

const searchAgent = {
  run: async (prompt: string) => ({ output: `Search: ${prompt}` }),
  model: llmModel, name: 'search_agent',
  instruction:
    'You are a technical search assistant specializing in Conductor. ' +
    'Use the search_web tool to find relevant information.',
  tools: [
    { name: 'search_web', description: 'Search the web for information about a Conductor bug.', fn: searchWeb, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  ],
  _google_adk: true,
};

// -- Root agent ------------------------------------------------------------

const softwareAssistant = {
  run: async (prompt: string) => ({ output: `BugAssist: ${prompt}` }),
  model: llmModel, name: 'software_assistant',
  instruction:
    'You are a software bug triage assistant for the Conductor workflow ' +
    'orchestration engine (https://github.com/conductor-oss/conductor).\n\n' +
    'Your capabilities:\n' +
    '1. Search and manage internal bug tickets\n' +
    '2. Research Conductor issues using the search_agent tool\n' +
    '3. Cross-reference issues with internal tickets\n\n' +
    'When triaging, search internal tickets, research unfamiliar issues, and suggest next steps.',
  tools: [
    { name: 'get_current_date', description: "Get today's date.", fn: getCurrentDate, parameters: { type: 'object', properties: {} } },
    { name: 'search_agent', description: 'Research agent for Conductor issues.', agent: searchAgent },
    { name: 'search_tickets', description: 'Search the internal bug ticket database.', fn: searchTickets, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'create_ticket', description: 'Create a new bug ticket.', fn: createTicket, parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } }, required: ['title', 'description'] } },
    { name: 'update_ticket', description: "Update an existing bug ticket's status or priority.", fn: updateTicket, parameters: { type: 'object', properties: { ticket_id: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' } }, required: ['ticket_id'] } },
  ],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    softwareAssistant,
    'Review the latest issues related to the TaskStatusListener and event handlers. ' +
      'Check if any of them relate to our internal tickets. ' +
      'Give me a triage summary.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
