/**
 * Email Drafter -- AI-powered professional email writing assistant.
 *
 * Demonstrates:
 *   - Generating professional emails for various scenarios
 *   - Subject line optimization
 *   - Follow-up and reply drafting
 *   - Tone adjustment (formal, friendly, assertive)
 *   - Practical use case: business communication assistant
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Shared LLM for tool-internal generation ──────────────

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0.3 });

// ── Tool definitions ─────────────────────────────────────

const draftEmail = new DynamicStructuredTool({
  name: 'draft_email',
  description: 'Draft a complete professional email.',
  schema: z.object({
    purpose: z.string().describe("The goal of the email (e.g., 'meeting request', 'follow-up', 'apology')"),
    recipient_name: z.string().describe('Name of the email recipient'),
    sender_name: z.string().describe('Name of the email sender'),
    key_points: z.string().describe('Comma-separated list of key points to include'),
    tone: z.string().default('professional').describe("Email tone — 'formal', 'professional', 'friendly', 'assertive'"),
  }),
  func: async ({ purpose, recipient_name, sender_name, key_points, tone }) => {
    const response = await llm.invoke(
      `Write a complete ${tone} email.\n` +
      `Purpose: ${purpose}\n` +
      `From: ${sender_name}\n` +
      `To: ${recipient_name}\n` +
      `Key points to include: ${key_points}\n\n` +
      "Include: Subject line, greeting, body paragraphs, closing, signature.\n" +
      "Format the subject line as 'Subject: [subject text]' on the first line.",
    );
    return typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
  },
});

const writeFollowUp = new DynamicStructuredTool({
  name: 'write_follow_up',
  description: "Write a follow-up email when you haven't received a response.",
  schema: z.object({
    original_email_summary: z.string().describe('Brief summary of what the original email was about'),
    days_since_sent: z.number().describe('How many days have passed since the original email'),
    your_name: z.string().describe('Your name for the signature'),
    recipient_name: z.string().describe("Recipient's name for the greeting"),
  }),
  func: async ({ original_email_summary, days_since_sent, your_name, recipient_name }) => {
    const urgency = days_since_sent < 5 ? 'gentle' : 'polite but firm';
    const response = await llm.invoke(
      `Write a ${urgency} follow-up email.\n` +
      `Original email was about: ${original_email_summary}\n` +
      `Sent ${days_since_sent} days ago with no response.\n` +
      `From: ${your_name} | To: ${recipient_name}\n` +
      'Keep it concise (3-4 sentences), acknowledge they may be busy, restate the ask.',
    );
    const content = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
    return `[FOLLOW-UP EMAIL]\n${content}`;
  },
});

const writeReply = new DynamicStructuredTool({
  name: 'write_reply',
  description: 'Draft a reply to an incoming email.',
  schema: z.object({
    original_message: z.string().describe('The email you received that you need to reply to'),
    your_response: z.string().describe('Your intended response/answer in plain language'),
    your_name: z.string().describe('Your name for the signature'),
    tone: z.string().default('professional').describe("Reply tone — 'professional', 'friendly', 'formal'"),
  }),
  func: async ({ original_message, your_response, your_name, tone }) => {
    const response = await llm.invoke(
      `Write a ${tone} email reply.\n` +
      `Original message:\n${original_message}\n\n` +
      `My intended response: ${your_response}\n` +
      `Signed by: ${your_name}\n\n` +
      'Make the reply polished and complete.',
    );
    const content = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
    return `[REPLY]\n${content}`;
  },
});

const improveEmail = new DynamicStructuredTool({
  name: 'improve_email',
  description: 'Improve an existing email draft based on specific feedback.',
  schema: z.object({
    draft: z.string().describe('The existing email draft to improve'),
    improvements: z.string().describe("Specific improvements to make (e.g., 'make it shorter', 'be more assertive')"),
  }),
  func: async ({ draft, improvements }) => {
    const response = await llm.invoke(
      `Improve this email based on the following instructions:\n` +
      `Instructions: ${improvements}\n\n` +
      `Original email:\n${draft}\n\n` +
      'Return the improved version only.',
    );
    const content = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
    return `[IMPROVED VERSION]\n${content}`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [draftEmail, writeFollowUp, writeReply, improveEmail];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const EMAIL_SYSTEM =
  'You are a professional business communication assistant.\n' +
  'When helping with emails:\n' +
  '- Always use clear, concise language\n' +
  '- Match formality to the relationship and context\n' +
  '- Every email must have a clear purpose and call-to-action\n' +
  '- Proofread for tone before finalizing';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(EMAIL_SYSTEM),
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

async function main() {
  const requests = [
    'Draft an email from Sarah (Product Manager) to John (VP Engineering) ' +
      'requesting a meeting to discuss Q2 roadmap priorities. Include: ' +
      'proposed times next week, agenda overview, and that it should take 45 minutes.',
    'Write a follow-up email. I sent John an email about Q2 roadmap 4 days ago ' +
      "and haven't heard back. My name is Sarah.",
  ];

  const runtime = new AgentRuntime();
  try {
    for (const req of requests) {
      console.log(`\nRequest: ${req.slice(0, 80)}...`);
      const result = await runtime.run(agentRunnable, req);
      result.printResult();
      console.log('-'.repeat(60));
    }
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
