/**
 * Code Review Agent -- automated code review with categorized feedback.
 *
 * Demonstrates:
 *   - Specialized system prompt for a code reviewer persona
 *   - Tools for checking different aspects of code quality
 *   - Aggregating findings into a structured review report
 *   - Practical use case: automated PR reviewer / code quality gate
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock tool implementations --

function checkSyntax(code: string): string {
  // Simple heuristic checks
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;

  if (openBraces !== closeBraces) {
    return `Syntax Error: mismatched braces (${openBraces} open, ${closeBraces} close)`;
  }
  if (openParens !== closeParens) {
    return `Syntax Error: mismatched parentheses (${openParens} open, ${closeParens} close)`;
  }
  return 'Syntax: OK -- no syntax errors detected.';
}

function checkComplexity(code: string): string {
  let complexity = 1;
  const keywords = ['if', 'for', 'while', 'catch', 'case', '&&', '||', '?'];
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = code.match(regex);
    if (matches) complexity += matches.length;
  }

  let rating: string;
  if (complexity <= 5) rating = 'Low (good)';
  else if (complexity <= 10) rating = 'Medium (acceptable)';
  else rating = 'High (consider refactoring)';

  return `Cyclomatic complexity: ${complexity} -- ${rating}`;
}

function checkNamingConventions(code: string): string {
  const issues: string[] = [];
  // Check for camelCase functions (JS convention)
  const funcMatches = code.matchAll(/function\s+([a-zA-Z_]\w*)/g);
  for (const match of funcMatches) {
    const name = match[1];
    if (name !== name.charAt(0).toLowerCase() + name.slice(1)) {
      issues.push(`Function '${name}' should start with lowercase (camelCase)`);
    }
  }
  // Check for PascalCase classes
  const classMatches = code.matchAll(/class\s+([a-zA-Z_]\w*)/g);
  for (const match of classMatches) {
    const name = match[1];
    if (name[0] !== name[0].toUpperCase()) {
      issues.push(`Class '${name}' should be PascalCase`);
    }
  }

  return issues.length > 0
    ? `Naming issues:\n${issues.map((i) => `  - ${i}`).join('\n')}`
    : 'Naming conventions: OK -- all names follow conventions.';
}

function checkDocstrings(code: string): string {
  const funcDefs = code.match(/function\s+\w+/g) || [];
  const jsdocBlocks = code.match(/\/\*\*[\s\S]*?\*\//g) || [];

  if (funcDefs.length > jsdocBlocks.length) {
    return `Missing documentation: ${funcDefs.length - jsdocBlocks.length} function(s) lack JSDoc comments.`;
  }
  return 'Documentation: OK -- all functions have JSDoc comments.';
}

const SAMPLE_CODE = `
function calculateTotal(items, taxRate) {
  let total = 0;
  for (const item of items) {
    if (item.price > 0) {
      total += item.price;
      if (item.discount) {
        total -= item.discount;
      }
    }
  }
  return total * (1 + taxRate);
}

class shoppingCart {
  addItem(item) {
    this.items.push(item);
  }

  removeItem(itemId) {
    this.items = this.items.filter(i => i.id !== itemId);
  }
}`;

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const code = SAMPLE_CODE;
    const results = [
      checkSyntax(code),
      checkComplexity(code),
      checkNamingConventions(code),
      checkDocstrings(code),
    ];

    const output = [
      'Code Review Report:',
      '='.repeat(40),
      ...results,
      '',
      'Overall: 6/10 -- Functional but needs documentation and naming fixes.',
      'Top 3 Improvements:',
      '  1. Add JSDoc comments to all functions',
      '  2. Rename class "shoppingCart" to "ShoppingCart" (PascalCase)',
      '  3. Add TypeScript types for better safety',
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running code review agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    `Please review this code:\n\n\`\`\`javascript\n${SAMPLE_CODE}\n\`\`\``,
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
