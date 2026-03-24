/**
 * Advanced Orchestration -- LangChain agent orchestrating a complex multi-step pipeline.
 *
 * Demonstrates:
 *   - Combining multiple LangChain patterns: structured output, prompt templates, output parsers
 *   - A pipeline agent that decomposes tasks, assigns subtasks, and aggregates results
 *   - Tools that themselves invoke LLM chains (nested LLM calls)
 *   - Practical use case: automated business report generation from raw data inputs
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { JsonOutputParser, StrOutputParser } from '@langchain/core/output_parsers';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock chain-based tool implementations --

function analyzeMarketData(company: string, sector: string): string {
  return `${company} operates in the competitive ${sector} sector. The company has established ` +
    'a strong position among mid-market players with differentiated product offerings. ' +
    `The ${sector} market is growing at 15-20% annually, driven by cloud adoption and digital transformation. ` +
    `Key competitors include established players and well-funded startups.`;
}

function generateFinancialMetrics(company: string, revenue: string, growthRate: string): string {
  return [
    `Financial Insights for ${company}:`,
    `1. Revenue of ${revenue} with ${growthRate} YoY growth indicates strong market traction`,
    '2. At this growth rate, the company could reach $20M+ ARR within 12 months',
    '3. Growth significantly exceeds industry average of 15-20%',
    '4. Current revenue implies a potential valuation of $60-100M at typical SaaS multiples',
    '5. Strong unit economics suggested by sustained high growth rate',
  ].join('\n');
}

function assessRisks(company: string, sector: string, growthRate: string): string {
  return [
    `Risk Assessment for ${company}:`,
    `1. Market Risk: ${sector} sector faces increasing competition from well-capitalized incumbents`,
    '2. Growth Sustainability: Maintaining ' + growthRate + ' growth requires significant sales investment',
    '3. Talent Risk: Engineering talent in cloud infrastructure is scarce and expensive',
    '4. Customer Concentration: Early-stage SaaS companies often depend on a few large accounts',
    '5. Technology Risk: Rapid evolution in cloud infrastructure may require frequent pivots',
  ].join('\n');
}

function compileReport(
  company: string,
  marketAnalysis: string,
  financialMetrics: string,
  riskAssessment: string,
): string {
  return [
    '='.repeat(60),
    `Executive Report: ${company}`,
    '='.repeat(60),
    '',
    'EXECUTIVE SUMMARY:',
    `${company} is a high-growth SaaS company in the cloud infrastructure sector, ` +
      'demonstrating strong market traction with above-average growth rates and clear product-market fit.',
    '',
    'MARKET POSITION:',
    marketAnalysis,
    '',
    'FINANCIAL OVERVIEW:',
    financialMetrics,
    '',
    'RISK FACTORS:',
    riskAssessment,
    '',
    'RECOMMENDATIONS:',
    '  1. Invest in sales team expansion to sustain growth trajectory',
    '  2. Diversify customer base to reduce concentration risk',
    '  3. Build strategic partnerships with cloud providers',
    '  4. Establish an advisory board with industry veterans',
    '  5. Begin Series B preparation within next two quarters',
  ].join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const company = 'TechStartup Inc.';
    const sector = 'cloud infrastructure';
    const revenue = '$12M';
    const growthRate = '45%';

    // Step 1: Market analysis
    const market = analyzeMarketData(company, sector);

    // Step 2: Financial metrics
    const financials = generateFinancialMetrics(company, revenue, growthRate);

    // Step 3: Risk assessment
    const risks = assessRisks(company, sector, growthRate);

    // Step 4: Compile final report
    const output = compileReport(company, market, financials, risks);

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running advanced orchestration agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Generate a complete executive report for TechStartup Inc., ' +
      'a SaaS company in the cloud infrastructure sector with $12M annual revenue ' +
      'and 45% year-over-year growth.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
