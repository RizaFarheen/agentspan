/**
 * SQL Agent -- natural language to SQL query generation and explanation.
 *
 * Demonstrates:
 *   - Translating natural language questions to SQL queries
 *   - Executing queries against a mock in-memory database
 *   - Explaining query results in plain English
 *   - Practical use case: business intelligence assistant for non-technical users
 *
 * NOTE: Since we cannot run SQLite in-process in TypeScript without native bindings,
 * this example uses a mock database with pre-defined query results.
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Mock database ────────────────────────────────────────

interface Employee {
  id: number;
  name: string;
  department: string;
  salary: number;
  hire_year: number;
  manager_id: number | null;
}

interface Project {
  id: number;
  name: string;
  department: string;
  budget: number;
  status: string;
}

const EMPLOYEES: Employee[] = [
  { id: 1, name: 'Alice Chen', department: 'Engineering', salary: 120000, hire_year: 2019, manager_id: null },
  { id: 2, name: 'Bob Martinez', department: 'Engineering', salary: 95000, hire_year: 2021, manager_id: 1 },
  { id: 3, name: 'Carol White', department: 'Engineering', salary: 88000, hire_year: 2022, manager_id: 1 },
  { id: 4, name: 'David Kim', department: 'Marketing', salary: 75000, hire_year: 2020, manager_id: null },
  { id: 5, name: 'Emma Wilson', department: 'Marketing', salary: 68000, hire_year: 2022, manager_id: 4 },
  { id: 6, name: 'Frank Brown', department: 'Finance', salary: 110000, hire_year: 2018, manager_id: null },
  { id: 7, name: 'Grace Lee', department: 'Finance', salary: 92000, hire_year: 2020, manager_id: 6 },
  { id: 8, name: 'Henry Davis', department: 'HR', salary: 72000, hire_year: 2021, manager_id: null },
];

const PROJECTS: Project[] = [
  { id: 1, name: 'API Redesign', department: 'Engineering', budget: 150000, status: 'active' },
  { id: 2, name: 'Brand Refresh', department: 'Marketing', budget: 80000, status: 'active' },
  { id: 3, name: 'Audit System', department: 'Finance', budget: 120000, status: 'completed' },
  { id: 4, name: 'Data Pipeline', department: 'Engineering', budget: 200000, status: 'active' },
  { id: 5, name: 'Recruitment Portal', department: 'HR', budget: 45000, status: 'planning' },
];

// ── Shared LLM for tool-internal calls ─────────────────────

const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

// ── Tool definitions ─────────────────────────────────────

const getSchema = new DynamicStructuredTool({
  name: 'get_schema',
  description: 'Return the database schema showing all tables and their columns.',
  schema: z.object({}),
  func: async () => {
    return (
      'Database Schema:\n' +
      'employees(id INTEGER, name TEXT, department TEXT, salary REAL, hire_year INTEGER, manager_id INTEGER)\n' +
      'projects(id INTEGER, name TEXT, department TEXT, budget REAL, status TEXT)'
    );
  },
});

const runSqlQuery = new DynamicStructuredTool({
  name: 'run_sql_query',
  description: 'Execute a read-only SQL SELECT query and return results.',
  schema: z.object({
    sql: z.string().describe('A valid SQLite SELECT statement'),
  }),
  func: async ({ sql }) => {
    const sqlUpper = sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
      return 'Error: Only SELECT queries are allowed.';
    }

    // Simple mock SQL execution -- parse common query patterns
    try {
      // Average salary by department
      if (sqlUpper.includes('AVG') && sqlUpper.includes('SALARY') && sqlUpper.includes('GROUP BY') && sqlUpper.includes('DEPARTMENT')) {
        const groups: Record<string, number[]> = {};
        for (const e of EMPLOYEES) {
          if (!groups[e.department]) groups[e.department] = [];
          groups[e.department].push(e.salary);
        }
        const rows = Object.entries(groups).map(([dept, salaries]) => {
          const avg = salaries.reduce((a, b) => a + b, 0) / salaries.length;
          return `${dept} | ${avg.toFixed(2)}`;
        });
        return `Results (${rows.length} row(s)):\ndepartment | avg_salary\n${'-'.repeat(30)}\n${rows.join('\n')}`;
      }

      // Employees hired before 2020 earning over 100k
      if (sqlUpper.includes('HIRE_YEAR') && (sqlUpper.includes('< 2020') || sqlUpper.includes('<2020') || sqlUpper.includes('BEFORE')) &&
          sqlUpper.includes('SALARY') && sqlUpper.includes('100000')) {
        const filtered = EMPLOYEES.filter((e) => e.hire_year < 2020 && e.salary > 100000);
        if (filtered.length === 0) return 'Query returned no results.';
        const header = 'name | department | salary | hire_year';
        const rows = filtered.map((e) => `${e.name} | ${e.department} | ${e.salary} | ${e.hire_year}`);
        return `Results (${rows.length} row(s)):\n${header}\n${'-'.repeat(40)}\n${rows.join('\n')}`;
      }

      // Active projects count and budget
      if (sqlUpper.includes('ACTIVE') && sqlUpper.includes('PROJECT')) {
        const active = PROJECTS.filter((p) => p.status === 'active');
        const totalBudget = active.reduce((s, p) => s + p.budget, 0);
        return `Results (1 row(s)):\ncount | total_budget\n${'-'.repeat(25)}\n${active.length} | ${totalBudget.toFixed(2)}`;
      }

      // Count by department
      if (sqlUpper.includes('COUNT') && sqlUpper.includes('GROUP BY') && sqlUpper.includes('DEPARTMENT')) {
        const groups: Record<string, number> = {};
        for (const e of EMPLOYEES) {
          groups[e.department] = (groups[e.department] ?? 0) + 1;
        }
        const rows = Object.entries(groups).map(([dept, count]) => `${dept} | ${count}`);
        return `Results (${rows.length} row(s)):\ndepartment | count\n${'-'.repeat(25)}\n${rows.join('\n')}`;
      }

      // All employees
      if (sqlUpper.includes('FROM EMPLOYEES') && !sqlUpper.includes('WHERE')) {
        const header = 'id | name | department | salary | hire_year | manager_id';
        const rows = EMPLOYEES.map((e) => `${e.id} | ${e.name} | ${e.department} | ${e.salary} | ${e.hire_year} | ${e.manager_id ?? 'NULL'}`);
        return `Results (${rows.length} row(s)):\n${header}\n${'-'.repeat(60)}\n${rows.join('\n')}`;
      }

      // All projects
      if (sqlUpper.includes('FROM PROJECTS') && !sqlUpper.includes('WHERE')) {
        const header = 'id | name | department | budget | status';
        const rows = PROJECTS.map((p) => `${p.id} | ${p.name} | ${p.department} | ${p.budget} | ${p.status}`);
        return `Results (${rows.length} row(s)):\n${header}\n${'-'.repeat(50)}\n${rows.join('\n')}`;
      }

      // Generic fallback: try basic WHERE on employees
      return `Query executed. Results may be approximate (mock database). Try rephrasing or using a simpler query.`;
    } catch {
      return 'SQL Error: could not parse query.';
    }
  },
});

const generateSql = new DynamicStructuredTool({
  name: 'generate_sql',
  description: 'Generate a SQL query for the given natural language question. Uses the database schema to generate an appropriate SELECT query.',
  schema: z.object({
    question: z.string().describe('Natural language question about the database'),
  }),
  func: async ({ question }) => {
    const schema = await getSchema.invoke({});
    const response = await llm.invoke(
      `Given this database schema:\n${schema}\n\n` +
      `Write a SQLite SELECT query to answer: '${question}'\n` +
      'Return ONLY the SQL query, no explanation.',
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return content.trim();
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [getSchema, generateSql, runSqlQuery];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const SQL_SYSTEM =
  'You are a data analyst assistant with SQL expertise.\n' +
  'When answering data questions:\n' +
  '1. First get the schema to understand the database structure\n' +
  '2. Generate the appropriate SQL query\n' +
  '3. Execute the query to get results\n' +
  '4. Explain the results in plain English\n' +
  'Always explain what the numbers mean in business terms.';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SQL_SYSTEM),
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
  const questions = [
    'What is the average salary by department?',
    'Which employees were hired before 2020 and earn over $100k?',
    'How many active projects are there and what is their total budget?',
  ];

  const runtime = new AgentRuntime();
  try {
    for (const q of questions) {
      console.log(`\nQuestion: ${q}`);
      const result = await runtime.run(agentRunnable, q);
      result.printResult();
      console.log('-'.repeat(60));
    }
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('17-sql-agent.ts') || process.argv[1]?.endsWith('17-sql-agent.js')) {
  main().catch(console.error);
}
