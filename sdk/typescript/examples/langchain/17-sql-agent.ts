/**
 * SQL Agent -- natural language to SQL query generation and explanation.
 *
 * Demonstrates:
 *   - Translating natural language questions to SQL queries
 *   - Executing queries against an in-memory data store
 *   - Explaining query results in plain English
 *   - Practical use case: business intelligence assistant for non-technical users
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 *   import { SqlDatabase } from 'langchain/sql_db';
 */

import { AgentRuntime } from '../../src/index.js';

// -- In-memory "database" --

interface Employee {
  id: number;
  name: string;
  department: string;
  salary: number;
  hireYear: number;
  managerId: number | null;
}

interface Project {
  id: number;
  name: string;
  department: string;
  budget: number;
  status: string;
}

const employees: Employee[] = [
  { id: 1, name: 'Alice Chen', department: 'Engineering', salary: 120000, hireYear: 2019, managerId: null },
  { id: 2, name: 'Bob Martinez', department: 'Engineering', salary: 95000, hireYear: 2021, managerId: 1 },
  { id: 3, name: 'Carol White', department: 'Engineering', salary: 88000, hireYear: 2022, managerId: 1 },
  { id: 4, name: 'David Kim', department: 'Marketing', salary: 75000, hireYear: 2020, managerId: null },
  { id: 5, name: 'Emma Wilson', department: 'Marketing', salary: 68000, hireYear: 2022, managerId: 4 },
  { id: 6, name: 'Frank Brown', department: 'Finance', salary: 110000, hireYear: 2018, managerId: null },
  { id: 7, name: 'Grace Lee', department: 'Finance', salary: 92000, hireYear: 2020, managerId: 6 },
  { id: 8, name: 'Henry Davis', department: 'HR', salary: 72000, hireYear: 2021, managerId: null },
];

const projects: Project[] = [
  { id: 1, name: 'API Redesign', department: 'Engineering', budget: 150000, status: 'active' },
  { id: 2, name: 'Brand Refresh', department: 'Marketing', budget: 80000, status: 'active' },
  { id: 3, name: 'Audit System', department: 'Finance', budget: 120000, status: 'completed' },
  { id: 4, name: 'Data Pipeline', department: 'Engineering', budget: 200000, status: 'active' },
  { id: 5, name: 'Recruitment Portal', department: 'HR', budget: 45000, status: 'planning' },
];

function getSchema(): string {
  return [
    'Database Schema:',
    'employees(id INTEGER, name TEXT, department TEXT, salary REAL, hire_year INTEGER, manager_id INTEGER)',
    'projects(id INTEGER, name TEXT, department TEXT, budget REAL, status TEXT)',
  ].join('\n');
}

function avgSalaryByDept(): string {
  const depts: Record<string, { total: number; count: number }> = {};
  for (const e of employees) {
    if (!depts[e.department]) depts[e.department] = { total: 0, count: 0 };
    depts[e.department].total += e.salary;
    depts[e.department].count++;
  }
  const lines = ['department | avg_salary', '-'.repeat(30)];
  for (const [dept, { total, count }] of Object.entries(depts).sort()) {
    lines.push(`${dept} | $${(total / count).toFixed(2)}`);
  }
  return `Results (${Object.keys(depts).length} row(s)):\n${lines.join('\n')}`;
}

function highEarnersBefore2020(): string {
  const matches = employees.filter((e) => e.hireYear < 2020 && e.salary > 100000);
  const lines = ['name | department | salary | hire_year', '-'.repeat(50)];
  for (const e of matches) {
    lines.push(`${e.name} | ${e.department} | $${e.salary} | ${e.hireYear}`);
  }
  return `Results (${matches.length} row(s)):\n${lines.join('\n')}`;
}

function activeProjectsSummary(): string {
  const active = projects.filter((p) => p.status === 'active');
  const totalBudget = active.reduce((s, p) => s + p.budget, 0);
  return `Active projects: ${active.length}\nTotal budget: $${totalBudget.toLocaleString('en-US')}`;
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    let output: string;

    if (query.includes('average salary') || query.includes('avg salary')) {
      output = `${getSchema()}\n\n${avgSalaryByDept()}`;
    } else if (query.includes('hired before 2020') || query.includes('over $100k') || query.includes('over 100k')) {
      output = `${getSchema()}\n\n${highEarnersBefore2020()}`;
    } else if (query.includes('active project')) {
      output = `${getSchema()}\n\n${activeProjectsSummary()}`;
    } else {
      output = `${getSchema()}\n\nPlease ask about employee salaries, hiring data, or projects.`;
    }

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  const questions = [
    'What is the average salary by department?',
    'Which employees were hired before 2020 and earn over $100k?',
    'How many active projects are there and what is their total budget?',
  ];

  for (const q of questions) {
    console.log(`\nQuestion: ${q}`);
    const result = await runtime.run(langchainAgent, q);
    result.printResult();
    console.log('-'.repeat(60));
  }

  await runtime.shutdown();
}

main().catch(console.error);
