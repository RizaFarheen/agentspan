/**
 * Data Analyst Agent -- analyze data and generate insights.
 *
 * Demonstrates:
 *   - Tools for data operations (describe, aggregate, top performers, growth)
 *   - Working with tabular data represented as JSON
 *   - LLM-generated natural language insights from raw numbers
 *   - Practical use case: automated data analysis and reporting
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Sample dataset: monthly sales data ──────────────────

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

// ── Tool definitions ─────────────────────────────────────

const describeDataset = new DynamicStructuredTool({
  name: 'describe_dataset',
  description: 'Get a summary description of the sales dataset.',
  schema: z.object({}),
  func: async () => {
    const totalSales = SALES_DATA.reduce((s, r) => s + r.sales, 0);
    const totalUnits = SALES_DATA.reduce((s, r) => s + r.units, 0);
    const months = Array.from(new Set(SALES_DATA.map((r) => r.month))).sort();
    const regions = Array.from(new Set(SALES_DATA.map((r) => r.region))).sort();
    const products = Array.from(new Set(SALES_DATA.map((r) => r.product))).sort();
    return (
      `Dataset: Monthly Sales Data\n` +
      `Records: ${SALES_DATA.length}\n` +
      `Months: ${months.join(', ')}\n` +
      `Regions: ${regions.join(', ')}\n` +
      `Products: ${products.join(', ')}\n` +
      `Total Sales: $${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n` +
      `Total Units: ${totalUnits.toLocaleString('en-US')}`
    );
  },
});

const aggregateBy = new DynamicStructuredTool({
  name: 'aggregate_by',
  description: "Aggregate sales data by a column (month, region, or product).",
  schema: z.object({
    column: z.string().describe("Column to group by — 'month', 'region', or 'product'"),
    metric: z.string().default('sales').describe("Metric to sum — 'sales' or 'units'"),
  }),
  func: async ({ column, metric }) => {
    if (!['month', 'region', 'product'].includes(column)) {
      return `Invalid column '${column}'. Choose from: month, region, product.`;
    }
    if (!['sales', 'units'].includes(metric)) {
      return `Invalid metric '${metric}'. Choose from: sales, units.`;
    }

    const groups: Record<string, number> = {};
    for (const row of SALES_DATA) {
      const key = row[column as keyof SalesRecord] as string;
      groups[key] = (groups[key] ?? 0) + (row[metric as 'sales' | 'units']);
    }

    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const lines = [`Total ${metric} by ${column}:`];
    for (const [k, v] of sorted) {
      if (metric === 'sales') {
        lines.push(`  ${k}: $${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      } else {
        lines.push(`  ${k}: ${v.toLocaleString('en-US')} units`);
      }
    }
    return lines.join('\n');
  },
});

const findTopPerformers = new DynamicStructuredTool({
  name: 'find_top_performers',
  description: 'Find the top N performing records by sales or units.',
  schema: z.object({
    n: z.number().default(3).describe('Number of top records to return (1-10)'),
    metric: z.string().default('sales').describe("Ranking metric — 'sales' or 'units'"),
  }),
  func: async ({ n, metric }) => {
    const sorted = [...SALES_DATA].sort(
      (a, b) => (b[metric as 'sales' | 'units'] ?? 0) - (a[metric as 'sales' | 'units'] ?? 0),
    );
    const top = sorted.slice(0, Math.min(n, 10));
    const lines = [`Top ${top.length} by ${metric}:`];
    top.forEach((row, i) => {
      lines.push(
        `  ${i + 1}. ${row.month} ${row.region} ${row.product}: $${row.sales.toLocaleString('en-US')} / ${row.units} units`,
      );
    });
    return lines.join('\n');
  },
});

const calculateGrowth = new DynamicStructuredTool({
  name: 'calculate_growth',
  description: 'Calculate month-over-month sales growth for a product.',
  schema: z.object({
    product: z.string().describe("Product name (e.g., 'Widget A')"),
  }),
  func: async ({ product }) => {
    const monthly: Record<string, number> = {};
    for (const row of SALES_DATA) {
      if (row.product === product) {
        monthly[row.month] = (monthly[row.month] ?? 0) + row.sales;
      }
    }
    if (Object.keys(monthly).length < 2) {
      return `Not enough data to calculate growth for '${product}'.`;
    }

    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sortedMonths = Object.keys(monthly).sort(
      (a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b),
    );

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
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [describeDataset, aggregateBy, findTopPerformers, calculateGrowth];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const ANALYST_SYSTEM =
  'You are a data analyst assistant. When asked to analyze data:\n' +
  '1. Start by describing the dataset\n' +
  '2. Aggregate data by relevant dimensions\n' +
  '3. Identify top performers\n' +
  '4. Calculate trends/growth where relevant\n' +
  '5. Summarize insights in a clear executive narrative (3-4 sentences)';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(ANALYST_SYSTEM),
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

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      'Analyze the sales data and give me a full report including trends and top performers.',
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
