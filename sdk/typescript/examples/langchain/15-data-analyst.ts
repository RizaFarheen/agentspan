/**
 * Data Analyst Agent -- analyze data and generate insights.
 *
 * Demonstrates:
 *   - Tools for data operations (filter, sort, aggregate, describe)
 *   - Working with tabular data represented as JSON
 *   - LLM-generated natural language insights from raw numbers
 *   - Practical use case: automated data analysis and reporting
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Sample dataset --

interface SalesRecord {
  month: string;
  region: string;
  product: string;
  sales: number;
  units: number;
}

const SALES_DATA: SalesRecord[] = [
  { month: 'Jan', region: 'North', product: 'Widget A', sales: 12500, units: 250 },
  { month: 'Jan', region: 'South', product: 'Widget A', sales: 9800, units: 196 },
  { month: 'Jan', region: 'North', product: 'Widget B', sales: 8200, units: 164 },
  { month: 'Feb', region: 'North', product: 'Widget A', sales: 15300, units: 306 },
  { month: 'Feb', region: 'South', product: 'Widget A', sales: 11200, units: 224 },
  { month: 'Feb', region: 'North', product: 'Widget B', sales: 9100, units: 182 },
  { month: 'Mar', region: 'North', product: 'Widget A', sales: 18700, units: 374 },
  { month: 'Mar', region: 'South', product: 'Widget A', sales: 13400, units: 268 },
  { month: 'Mar', region: 'South', product: 'Widget B', sales: 7600, units: 152 },
];

function describeDataset(): string {
  const totalSales = SALES_DATA.reduce((s, r) => s + r.sales, 0);
  const totalUnits = SALES_DATA.reduce((s, r) => s + r.units, 0);
  const months = [...new Set(SALES_DATA.map((r) => r.month))].sort();
  const regions = [...new Set(SALES_DATA.map((r) => r.region))].sort();
  const products = [...new Set(SALES_DATA.map((r) => r.product))].sort();
  return [
    'Dataset: Monthly Sales Data',
    `Records: ${SALES_DATA.length}`,
    `Months: ${months.join(', ')}`,
    `Regions: ${regions.join(', ')}`,
    `Products: ${products.join(', ')}`,
    `Total Sales: $${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `Total Units: ${totalUnits.toLocaleString('en-US')}`,
  ].join('\n');
}

function aggregateBy(column: 'month' | 'region' | 'product', metric: 'sales' | 'units' = 'sales'): string {
  const groups: Record<string, number> = {};
  for (const row of SALES_DATA) {
    const key = row[column];
    groups[key] = (groups[key] ?? 0) + row[metric];
  }

  const sorted = Object.entries(groups).sort(([, a], [, b]) => b - a);
  const label = metric === 'sales' ? '$' : '';
  const lines = [`Total ${metric} by ${column}:`];
  for (const [k, v] of sorted) {
    if (metric === 'sales') {
      lines.push(`  ${k}: $${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    } else {
      lines.push(`  ${k}: ${v.toLocaleString('en-US')} units`);
    }
  }
  return lines.join('\n');
}

function findTopPerformers(n = 3, metric: 'sales' | 'units' = 'sales'): string {
  const sorted = [...SALES_DATA].sort((a, b) => b[metric] - a[metric]);
  const top = sorted.slice(0, Math.min(n, 10));
  const lines = [`Top ${top.length} by ${metric}:`];
  top.forEach((row, i) => {
    lines.push(`  ${i + 1}. ${row.month} ${row.region} ${row.product}: $${row.sales.toLocaleString('en-US')} / ${row.units} units`);
  });
  return lines.join('\n');
}

function calculateGrowth(product: string): string {
  const monthly: Record<string, number> = {};
  for (const row of SALES_DATA) {
    if (row.product === product) {
      monthly[row.month] = (monthly[row.month] ?? 0) + row.sales;
    }
  }
  const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const sortedMonths = Object.keys(monthly).sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b));

  if (sortedMonths.length < 2) return `Not enough data to calculate growth for '${product}'.`;

  const lines = [`Month-over-month growth for ${product}:`];
  let prevVal: number | null = null;
  for (const month of sortedMonths) {
    const val = monthly[month];
    if (prevVal !== null) {
      const growth = ((val - prevVal) / prevVal) * 100;
      lines.push(`  ${month}: $${val.toLocaleString('en-US')} (${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%)`);
    } else {
      lines.push(`  ${month}: $${val.toLocaleString('en-US')} (baseline)`);
    }
    prevVal = val;
  }
  return lines.join('\n');
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      describeDataset(),
      '',
      aggregateBy('month'),
      '',
      aggregateBy('region'),
      '',
      findTopPerformers(3),
      '',
      calculateGrowth('Widget A'),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running data analyst agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'Analyze the sales data and give me a full report including trends and top performers.',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
