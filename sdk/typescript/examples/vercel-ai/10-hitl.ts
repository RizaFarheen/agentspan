/**
 * Vercel AI SDK -- Human-in-the-Loop (HITL)
 *
 * Demonstrates a Vercel AI SDK agent that pauses for human approval
 * before executing sensitive actions. Uses a risk assessment tool
 * and an execution tool with simulated approval logic.
 */

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Model ────────────────────────────────────────────────
const model = openai('gpt-4o-mini');

// ── HITL approval simulation ─────────────────────────────
interface ApprovalRequest {
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

function checkApproval(request: ApprovalRequest): { approved: boolean; feedback: string } {
  // In production, this would pause and wait for human input via Agentspan UI/API.
  // Here we simulate: approve low/medium risk, reject high risk.
  if (request.risk === 'high') {
    return {
      approved: false,
      feedback: 'High-risk action rejected. Please provide additional justification.',
    };
  }
  return {
    approved: true,
    feedback: `Action approved (${request.risk} risk).`,
  };
}

// ── Tools ────────────────────────────────────────────────
const assessRisk = tool({
  description: 'Assess the risk level of a requested operation.',
  parameters: z.object({
    action: z.string().describe('The action to assess'),
    description: z.string().describe('Description of what the action will do'),
  }),
  execute: async ({ action, description }) => {
    let risk: 'low' | 'medium' | 'high' = 'low';
    const lower = `${action} ${description}`.toLowerCase();

    if (lower.includes('delete') || lower.includes('drop') || lower.includes('destroy')) {
      risk = 'high';
    } else if (lower.includes('update') || lower.includes('modify') || lower.includes('change')) {
      risk = 'medium';
    }

    const approval = checkApproval({ action, description, risk });
    return {
      risk,
      approved: approval.approved,
      feedback: approval.feedback,
    };
  },
});

const executeAction = tool({
  description: 'Execute an approved action. Only call this after risk assessment shows approval.',
  parameters: z.object({
    action: z.string().describe('The approved action to execute'),
  }),
  execute: async ({ action }) => ({
    status: 'completed',
    message: `Action "${action}" executed successfully.`,
  }),
});

const tools = { assessRisk, executeAction };
const system = `You are a careful assistant that assesses risk before taking action.
For every user request:
1. First use assessRisk to evaluate the operation
2. If approved, use executeAction to carry it out
3. If rejected, explain why and suggest alternatives
Never execute an action without assessing its risk first.`;

// ── Test cases ───────────────────────────────────────────
const testCases = [
  { label: 'Low risk (should be approved)', prompt: 'Fetch the latest sales report for Q4 2024.' },
  { label: 'Medium risk (should be approved)', prompt: 'Update the customer email address for account #12345.' },
  { label: 'High risk (should be rejected)', prompt: 'Delete all records from the staging database.' },
];

// ── Wrap as a duck-typed agent for agentspan ─────────────
const vercelAgent = {
  id: 'hitl_agent',
  tools,
  generate: async (opts: { prompt: string; onStepFinish?: (step: any) => void }) => {
    const result = await generateText({
      model,
      system,
      prompt: opts.prompt,
      tools,
      maxSteps: 5,
      onStepFinish: opts.onStepFinish,
    });

    // Extract risk metadata
    const riskResults = result.steps
      .flatMap(s => s.toolResults)
      .filter(tr => tr.toolName === 'assessRisk');
    const riskInfo = riskResults.length > 0
      ? (riskResults[0].result as { risk: string; approved: boolean })
      : { risk: 'unknown', approved: false };

    return {
      text: result.text,
      toolCalls: result.steps.flatMap(s => s.toolCalls),
      toolResults: result.steps.flatMap(s => s.toolResults),
      finishReason: result.finishReason,
      metadata: riskInfo,
    };
  },
  stream: async function* () { yield { type: 'finish' as const }; },
};

// ── Run on agentspan ─────────────────────────────────────
async function main() {
  const runtime = new AgentRuntime();
  try {
    for (const { label, prompt } of testCases) {
      console.log(`\n--- ${label} ---`);
      const result = await runtime.run(vercelAgent, prompt);
      console.log('Status:', result.status);
      result.printResult();
    }
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
