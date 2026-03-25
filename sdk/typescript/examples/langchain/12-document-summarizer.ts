/**
 * Document Summarizer -- multi-document summarization with different strategies.
 *
 * Demonstrates:
 *   - Summarize-by-chunks for long documents
 *   - Extract key points, action items, and decisions
 *   - Comparing multiple summarization styles (brief, detailed, bullets)
 *   - Practical use case: meeting notes -> executive summary pipeline
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Shared LLM for tool-internal calls ─────────────────────

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

// ── Tool definitions ─────────────────────────────────────

const briefSummary = new DynamicStructuredTool({
  name: 'brief_summary',
  description: 'Create a 1-2 sentence executive summary of the document.',
  schema: z.object({ text: z.string().describe('Document text to summarize') }),
  func: async ({ text }) => {
    const response = await llm.invoke([
      new SystemMessage('You are a professional summarizer. Write a concise 1-2 sentence executive summary.'),
      new HumanMessage(text),
    ]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Brief Summary:\n${content.trim()}`;
  },
});

const bulletSummary = new DynamicStructuredTool({
  name: 'bullet_summary',
  description: 'Extract the key points as a bulleted list (5-7 points).',
  schema: z.object({ text: z.string().describe('Document text to extract key points from') }),
  func: async ({ text }) => {
    const response = await llm.invoke([
      new SystemMessage('Extract the 5-7 most important points as a bulleted list. Each bullet should be one sentence.'),
      new HumanMessage(text),
    ]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Key Points:\n${content.trim()}`;
  },
});

const extractActionItems = new DynamicStructuredTool({
  name: 'extract_action_items',
  description: 'Extract all action items, tasks, and next steps from the document.',
  schema: z.object({ text: z.string().describe('Document text to extract action items from') }),
  func: async ({ text }) => {
    const response = await llm.invoke([
      new SystemMessage('Extract all action items, tasks, and next steps. Format as: [OWNER] Action. If no owner is mentioned, use [TBD].'),
      new HumanMessage(text),
    ]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Action Items:\n${content.trim()}`;
  },
});

const extractDecisions = new DynamicStructuredTool({
  name: 'extract_decisions',
  description: 'Extract all decisions made in the document.',
  schema: z.object({ text: z.string().describe('Document text to extract decisions from') }),
  func: async ({ text }) => {
    const response = await llm.invoke([
      new SystemMessage("Extract all decisions made. Format as a numbered list. If no decisions are present, say 'No decisions recorded.'"),
      new HumanMessage(text),
    ]);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Decisions:\n${content.trim()}`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [briefSummary, bulletSummary, extractActionItems, extractDecisions];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const SUMMARIZER_SYSTEM =
  'You are a document analysis assistant. When given a document:\n' +
  '1. Always create a brief summary first\n' +
  '2. Then extract key points as bullets\n' +
  '3. Extract action items and decisions\n' +
  '4. Present all findings in a structured report format';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SUMMARIZER_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 8; i++) {
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

// ── Wrap as runnable for Agentspan ─────────────────────────

const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    const output = await runAgentLoop(input.input);
    return { output };
  },
});

// Add agentspan metadata for extraction
(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

const MEETING_NOTES = `
Q3 Planning Meeting — Notes
Date: March 15, 2025 | Attendees: Sarah (PM), Alex (Engineering), Jordan (Design)

Sarah opened by reviewing Q2 metrics: 40% increase in user signups but 15% drop in retention.

Alex proposed migrating the database to PostgreSQL by end of April. The team agreed this would
improve query performance by ~30%. Alex will own the migration plan and have it ready by March 22.

Jordan presented three new dashboard designs. The team decided to go with Design Option B as it
scored highest in user testing. Jordan will finalize mockups by March 29 and share with
engineering for implementation scoping.

Sarah announced that the mobile app launch is pushed to Q4 due to resource constraints.
She will communicate this to stakeholders by end of week.

The team decided to implement weekly 30-minute sync meetings starting next Monday.
Jordan will set up the recurring calendar invite.

Next meeting: March 22, 2025.
`;

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      `Please analyze and summarize these meeting notes:\n\n${MEETING_NOTES}`,
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
