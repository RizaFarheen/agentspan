/**
 * Classification Agent -- multi-label text classification pipeline.
 *
 * Demonstrates:
 *   - Hierarchical classification (coarse -> fine-grained)
 *   - Zero-shot classification with confidence scores
 *   - Multi-label classification (text can belong to multiple categories)
 *   - Practical use case: support ticket routing and prioritization
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Ticket classification taxonomy ───────────────────────

const DEPARTMENTS = ['Engineering', 'Billing', 'Sales', 'HR', 'Legal', 'Operations'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const ISSUE_TYPES = ['Bug', 'Feature Request', 'Question', 'Complaint', 'Compliment', 'Incident'];

// ── Tool definitions ─────────────────────────────────────

const classifyDepartment = new DynamicStructuredTool({
  name: 'classify_department',
  description: 'Classify which department should handle this support ticket.',
  schema: z.object({
    ticket: z.string().describe('The support ticket text to classify'),
  }),
  func: async ({ ticket }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Classify this support ticket into the most appropriate department. ` +
        `Departments: ${DEPARTMENTS.join(', ')}\n` +
        `Return: DEPARTMENT: [name] | CONFIDENCE: [0-100%] | REASON: [brief]\n\n` +
        `Ticket: ${ticket}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return content.trim();
  },
});

const classifyPriority = new DynamicStructuredTool({
  name: 'classify_priority',
  description:
    'Assign a priority level to a support ticket. ' +
    'Critical: Service down, data loss, security breach. ' +
    'High: Major feature broken, significant business impact. ' +
    'Medium: Minor feature issue, workaround available. ' +
    'Low: Enhancement request, cosmetic issue.',
  schema: z.object({
    ticket: z.string().describe('The support ticket text'),
  }),
  func: async ({ ticket }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Assign a priority level to this support ticket.\n` +
        `Levels: Critical (outage/data loss), High (major issue), Medium (minor issue), Low (enhancement)\n` +
        `Return: PRIORITY: [level] | REASON: [one sentence]\n\n` +
        `Ticket: ${ticket}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return content.trim();
  },
});

const classifyIssueType = new DynamicStructuredTool({
  name: 'classify_issue_type',
  description: 'Classify the type of issue described in the ticket.',
  schema: z.object({
    ticket: z.string().describe('The support ticket text'),
  }),
  func: async ({ ticket }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Classify the type of issue. A ticket may have multiple types.\n` +
        `Issue types: ${ISSUE_TYPES.join(', ')}\n` +
        `Return the top 1-2 applicable types with confidence: TYPE1 (XX%), TYPE2 (YY%)\n\n` +
        `Ticket: ${ticket}`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return content.trim();
  },
});

const suggestResponseTemplate = new DynamicStructuredTool({
  name: 'suggest_response_template',
  description: 'Generate a response template for a given department and issue type.',
  schema: z.object({
    department: z.string().describe('Department handling the ticket'),
    issue_type: z.string().describe('Type of issue (Bug, Question, etc.)'),
  }),
  func: async ({ department, issue_type }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Write a brief, professional acknowledgment template for a ${department} ${issue_type} ticket. ` +
        `Include: acknowledgment, expected response time, and next steps. ` +
        `Keep it under 100 words. Use [CUSTOMER_NAME] and [TICKET_ID] as placeholders.`
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Response template:\n${content.trim()}`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [classifyDepartment, classifyPriority, classifyIssueType, suggestResponseTemplate];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const CLASSIFIER_SYSTEM = `You are a support ticket classification specialist.
For each ticket:
1. Classify the department
2. Assign priority level
3. Identify the issue type
4. Suggest an appropriate response template
5. Provide a classification summary with routing recommendation`;

async function runClassificationAgent(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(CLASSIFIER_SYSTEM),
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
    const output = await runClassificationAgent(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

const SAMPLE_TICKETS = [
  "URGENT: Our entire production API is down! All requests are returning 500 errors since 2am. We're losing thousands of dollars per minute. Need immediate help!",
  'Hi, I was charged twice for my subscription this month. Invoice #12345 shows two charges of $99 each. Please refund the duplicate.',
];

async function main() {
  const runtime = new AgentRuntime();
  try {
    for (const ticket of SAMPLE_TICKETS) {
      console.log(`\nTicket: ${ticket.slice(0, 80)}...`);
      const result = await runtime.run(
        agentRunnable,
        `Classify and route this support ticket:\n\n${ticket}`
      );
      result.printResult();
      console.log('-'.repeat(60));
    }
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('22-classification-agent.ts') || process.argv[1]?.endsWith('22-classification-agent.js')) {
  main().catch(console.error);
}
