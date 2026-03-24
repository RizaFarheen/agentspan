/**
 * Financial Advisor -- Multi-agent with specialized tool-using sub-agents.
 *
 * Mirrors the financial-advisor ADK sample. A coordinator agent delegates
 * to specialized sub-agents (portfolio analyst, market researcher, tax advisor)
 * each with their own tools.
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Portfolio tools -------------------------------------------------------

function getPortfolio(clientId: string): Record<string, unknown> {
  const portfolios: Record<string, Record<string, unknown>> = {
    'CLT-001': {
      client: 'Sarah Chen',
      total_value: 250000,
      holdings: [
        { asset: 'AAPL', shares: 100, value: 17500 },
        { asset: 'GOOGL', shares: 50, value: 8750 },
        { asset: 'US Treasury Bonds', units: 200, value: 200000 },
        { asset: 'S&P 500 ETF', shares: 150, value: 23750 },
      ],
      risk_profile: 'moderate',
    },
  };
  return portfolios[clientId.toUpperCase()] ?? { error: `Client ${clientId} not found` };
}

function calculateReturns(asset: string, periodMonths: number = 12): Record<string, unknown> {
  const returns: Record<string, Record<string, number>> = {
    AAPL: { return_pct: 15.2, annualized: 15.2 },
    GOOGL: { return_pct: 22.1, annualized: 22.1 },
    'US Treasury Bonds': { return_pct: 4.5, annualized: 4.5 },
    'S&P 500 ETF': { return_pct: 12.8, annualized: 12.8 },
  };
  const data = returns[asset] ?? { return_pct: 0, annualized: 0 };
  return { asset, period_months: periodMonths, ...data };
}

// -- Market tools ----------------------------------------------------------

function getMarketData(sector: string): Record<string, unknown> {
  const sectors: Record<string, Record<string, unknown>> = {
    technology: { trend: 'bullish', pe_ratio: 28.5, ytd_return: '18.3%' },
    healthcare: { trend: 'neutral', pe_ratio: 22.1, ytd_return: '8.7%' },
    energy: { trend: 'bearish', pe_ratio: 15.3, ytd_return: '-2.1%' },
    bonds: { trend: 'stable', yield: '4.5%', ytd_return: '3.2%' },
  };
  return sectors[sector.toLowerCase()] ?? { error: `Sector '${sector}' not found` };
}

function getEconomicIndicators(): Record<string, unknown> {
  return {
    gdp_growth: '2.1%',
    inflation: '3.2%',
    unemployment: '3.8%',
    fed_rate: '5.25%',
    consumer_confidence: 102.5,
  };
}

// -- Tax tools -------------------------------------------------------------

function estimateTaxImpact(gains: number, holdingPeriodMonths: number): Record<string, unknown> {
  const isLongTerm = holdingPeriodMonths >= 12;
  const rate = isLongTerm ? 0.15 : 0.32;
  const category = isLongTerm ? 'long-term' : 'short-term';
  const tax = Math.round(gains * rate * 100) / 100;
  return {
    gains,
    holding_period: `${holdingPeriodMonths} months`,
    category,
    tax_rate: `${rate * 100}%`,
    estimated_tax: tax,
  };
}

// -- Sub-agents ------------------------------------------------------------

const portfolioAnalyst = {
  run: async (prompt: string) => ({ output: `Portfolio: ${prompt}` }),
  model: llmModel,
  name: 'portfolio_analyst',
  description: 'Analyzes client portfolios and calculates returns.',
  instruction: 'You are a portfolio analyst. Use tools to retrieve and analyze client portfolios.',
  tools: [
    { name: 'get_portfolio', description: 'Get the investment portfolio for a client.', fn: getPortfolio, parameters: { type: 'object', properties: { client_id: { type: 'string' } }, required: ['client_id'] } },
    { name: 'calculate_returns', description: 'Calculate returns for an asset over a period.', fn: calculateReturns, parameters: { type: 'object', properties: { asset: { type: 'string' }, period_months: { type: 'number' } }, required: ['asset'] } },
  ],
  _google_adk: true,
};

const marketResearcher = {
  run: async (prompt: string) => ({ output: `Market: ${prompt}` }),
  model: llmModel,
  name: 'market_researcher',
  description: 'Researches market conditions and economic indicators.',
  instruction: 'You are a market researcher. Provide sector analysis and economic outlook.',
  tools: [
    { name: 'get_market_data', description: 'Get current market data for a sector.', fn: getMarketData, parameters: { type: 'object', properties: { sector: { type: 'string' } }, required: ['sector'] } },
    { name: 'get_economic_indicators', description: 'Get current key economic indicators.', fn: getEconomicIndicators, parameters: { type: 'object', properties: {} } },
  ],
  _google_adk: true,
};

const taxAdvisor = {
  run: async (prompt: string) => ({ output: `Tax: ${prompt}` }),
  model: llmModel,
  name: 'tax_advisor',
  description: 'Advises on tax implications of investment decisions.',
  instruction: 'You are a tax advisor. Estimate tax impacts of proposed changes.',
  tools: [
    { name: 'estimate_tax_impact', description: 'Estimate tax impact of selling an investment.', fn: estimateTaxImpact, parameters: { type: 'object', properties: { gains: { type: 'number' }, holding_period_months: { type: 'number' } }, required: ['gains', 'holding_period_months'] } },
  ],
  _google_adk: true,
};

// -- Coordinator -----------------------------------------------------------

const coordinator = {
  run: async (prompt: string) => ({ output: `Advisor: ${prompt}` }),
  model: llmModel,
  name: 'financial_advisor',
  instruction:
    'You are a senior financial advisor. Help clients with investment advice. ' +
    'Use the portfolio analyst to review holdings, market researcher for conditions, ' +
    'and tax advisor for tax implications. Provide a comprehensive recommendation.',
  sub_agents: [portfolioAnalyst, marketResearcher, taxAdvisor],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    "I'm client CLT-001. Review my portfolio and tell me if I should rebalance " +
      'given current market conditions. What would the tax impact be if I sold some AAPL?',
  );
  console.log(`Status: ${result.status}`);
  console.log(`Output: ${result.output}`);
} finally {
  await runtime.shutdown();
}
