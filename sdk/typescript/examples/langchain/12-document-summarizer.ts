/**
 * Document Summarizer -- multi-document summarization with different strategies.
 *
 * Demonstrates:
 *   - Summarize-by-chunks for long documents
 *   - Extract key points, action items, and decisions
 *   - Comparing multiple summarization styles (brief, detailed, bullets)
 *   - Practical use case: meeting notes -> executive summary pipeline
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

const MEETING_NOTES = `
Q3 Planning Meeting -- Notes
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

Next meeting: March 22, 2025.`;

// -- Mock tool implementations --

function briefSummary(text: string): string {
  return 'Brief Summary:\nThe Q3 planning meeting covered Q2 metrics review (signups up 40%, retention down 15%), ' +
    'a database migration to PostgreSQL planned for April, selection of dashboard Design Option B, ' +
    'and a mobile app launch delay to Q4.';
}

function bulletSummary(text: string): string {
  return [
    'Key Points:',
    '  - Q2 user signups increased 40% but retention dropped 15%',
    '  - Database migration to PostgreSQL approved, targeting end of April',
    '  - Dashboard Design Option B selected based on user testing scores',
    '  - Mobile app launch pushed to Q4 due to resource constraints',
    '  - Weekly 30-minute sync meetings to start next Monday',
    '  - Next meeting scheduled for March 22, 2025',
  ].join('\n');
}

function extractActionItems(text: string): string {
  return [
    'Action Items:',
    '  [Alex] Prepare PostgreSQL migration plan by March 22',
    '  [Jordan] Finalize dashboard mockups by March 29',
    '  [Sarah] Communicate mobile app delay to stakeholders by end of week',
    '  [Jordan] Set up recurring weekly sync calendar invite',
  ].join('\n');
}

function extractDecisions(text: string): string {
  return [
    'Decisions:',
    '  1. Migrate database to PostgreSQL by end of April',
    '  2. Proceed with Dashboard Design Option B',
    '  3. Push mobile app launch to Q4',
    '  4. Implement weekly 30-minute sync meetings',
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      briefSummary(MEETING_NOTES),
      '',
      bulletSummary(MEETING_NOTES),
      '',
      extractActionItems(MEETING_NOTES),
      '',
      extractDecisions(MEETING_NOTES),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running document summarizer agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    `Please analyze and summarize these meeting notes:\n\n${MEETING_NOTES}`,
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
