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
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function draftEmail(
  purpose: string,
  recipientName: string,
  senderName: string,
  keyPoints: string,
  tone = 'professional',
): string {
  return [
    `Subject: ${purpose} -- Discussion Request`,
    '',
    `Dear ${recipientName},`,
    '',
    `I hope this message finds you well. I am writing to ${purpose.toLowerCase()}.`,
    '',
    `Key points I would like to cover:`,
    ...keyPoints.split(',').map((p) => `  - ${p.trim()}`),
    '',
    'I look forward to hearing from you at your earliest convenience.',
    '',
    'Best regards,',
    senderName,
  ].join('\n');
}

function writeFollowUp(
  originalSummary: string,
  daysSinceSent: number,
  yourName: string,
  recipientName: string,
): string {
  const urgency = daysSinceSent < 5 ? 'gentle' : 'polite but firm';
  return [
    `[FOLLOW-UP EMAIL]`,
    `Dear ${recipientName},`,
    '',
    `I wanted to follow up on my previous email regarding ${originalSummary}. ` +
      `I sent it ${daysSinceSent} days ago and wanted to make sure it didn't get lost.`,
    '',
    'I understand you may be busy. Would you have a moment to review and share your thoughts?',
    '',
    'Best regards,',
    yourName,
  ].join('\n');
}

function writeReply(
  originalMessage: string,
  yourResponse: string,
  yourName: string,
  tone = 'professional',
): string {
  return [
    '[REPLY]',
    `Thank you for your message.`,
    '',
    yourResponse,
    '',
    'Best regards,',
    yourName,
  ].join('\n');
}

function improveEmail(draft: string, improvements: string): string {
  return `[IMPROVED VERSION]\n${draft}\n\n(Improvements applied: ${improvements})`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    let output: string;

    if (query.includes('follow-up') || query.includes('follow up')) {
      output = writeFollowUp('Q2 roadmap discussion', 4, 'Sarah', 'John');
    } else if (query.includes('draft') || query.includes('meeting')) {
      output = draftEmail(
        'Meeting Request: Q2 Roadmap Priorities',
        'John',
        'Sarah',
        'proposed times next week, agenda overview, 45 minute duration',
        'professional',
      );
    } else {
      output = 'Please specify what kind of email you need help with.';
    }

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const requests = [
    'Draft an email from Sarah (Product Manager) to John (VP Engineering) ' +
      'requesting a meeting to discuss Q2 roadmap priorities. Include: ' +
      'proposed times next week, agenda overview, and that it should take 45 minutes.',
    'Write a follow-up email. I sent John an email about Q2 roadmap 4 days ago ' +
      "and haven't heard back. My name is Sarah.",
  ];

  for (const req of requests) {
    console.log(`\nRequest: ${req.slice(0, 80)}...`);
    const result = await runtime.run(langchainAgent, req);
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
