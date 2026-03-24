/**
 * Classification Agent -- multi-label text classification pipeline.
 *
 * Demonstrates:
 *   - Hierarchical classification (coarse -> fine-grained)
 *   - Zero-shot classification with confidence scores
 *   - Multi-label classification (text can belong to multiple categories)
 *   - Practical use case: support ticket routing and prioritization
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Classification taxonomy --

const DEPARTMENTS = ['Engineering', 'Billing', 'Sales', 'HR', 'Legal', 'Operations'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const ISSUE_TYPES = ['Bug', 'Feature Request', 'Question', 'Complaint', 'Compliment', 'Incident'];

function classifyDepartment(ticket: string): string {
  const ticketLower = ticket.toLowerCase();
  if (ticketLower.includes('api') || ticketLower.includes('500 error') || ticketLower.includes('production')) {
    return 'DEPARTMENT: Engineering | CONFIDENCE: 95% | REASON: Technical issue involving API/production systems';
  }
  if (ticketLower.includes('charged') || ticketLower.includes('invoice') || ticketLower.includes('refund')) {
    return 'DEPARTMENT: Billing | CONFIDENCE: 92% | REASON: Financial/billing related inquiry';
  }
  return 'DEPARTMENT: Operations | CONFIDENCE: 60% | REASON: General inquiry';
}

function classifyPriority(ticket: string): string {
  const ticketLower = ticket.toLowerCase();
  if (ticketLower.includes('urgent') || ticketLower.includes('down') || ticketLower.includes('losing')) {
    return 'PRIORITY: Critical | REASON: Service outage with financial impact';
  }
  if (ticketLower.includes('charged twice') || ticketLower.includes('refund')) {
    return 'PRIORITY: High | REASON: Billing error affecting customer';
  }
  return 'PRIORITY: Medium | REASON: Standard support request';
}

function classifyIssueType(ticket: string): string {
  const ticketLower = ticket.toLowerCase();
  if (ticketLower.includes('500 error') || ticketLower.includes('down')) {
    return 'Incident (95%), Bug (80%)';
  }
  if (ticketLower.includes('charged twice')) {
    return 'Complaint (88%), Bug (65%)';
  }
  return 'Question (70%)';
}

function suggestResponseTemplate(department: string, issueType: string): string {
  return [
    'Response template:',
    `Dear [CUSTOMER_NAME],`,
    '',
    `Thank you for contacting ${department} support regarding your ${issueType.toLowerCase()}.`,
    'We have received your ticket [TICKET_ID] and our team is reviewing it.',
    `Expected response time: ${department === 'Engineering' ? '2 hours' : '24 hours'}.`,
    '',
    'Best regards,',
    `${department} Support Team`,
  ].join('\n');
}

const SAMPLE_TICKETS = [
  'URGENT: Our entire production API is down! All requests are returning 500 errors since 2am. We\'re losing thousands of dollars per minute. Need immediate help!',
  'Hi, I was charged twice for my subscription this month. Invoice #12345 shows two charges of $99 each. Please refund the duplicate.',
];

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input;

    // Find the ticket text in the query
    let ticket = query;
    for (const sample of SAMPLE_TICKETS) {
      if (query.includes(sample.slice(0, 30))) {
        ticket = sample;
        break;
      }
    }

    const dept = classifyDepartment(ticket);
    const priority = classifyPriority(ticket);
    const issueType = classifyIssueType(ticket);
    const deptName = dept.split('|')[0].replace('DEPARTMENT:', '').trim();
    const template = suggestResponseTemplate(deptName, 'Incident');

    const output = [
      'Classification Results:',
      '='.repeat(40),
      dept,
      priority,
      `Issue Type: ${issueType}`,
      '',
      template,
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  for (const ticket of SAMPLE_TICKETS) {
    console.log(`\nTicket: ${ticket.slice(0, 80)}...`);
    const result = await runtime.run(
      langchainAgent,
      `Classify and route this support ticket:\n\n${ticket}`,
    );
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
