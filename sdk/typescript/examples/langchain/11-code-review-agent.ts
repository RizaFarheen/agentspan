/**
 * Code Review Agent -- automated code review with categorized feedback.
 *
 * Demonstrates:
 *   - Specialized system prompt for a code reviewer persona
 *   - Tools for checking different aspects of code quality
 *   - Aggregating findings into a structured review report
 *   - Practical use case: automated PR reviewer / code quality gate
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Tool definitions ─────────────────────────────────────

const checkSyntax = new DynamicStructuredTool({
  name: 'check_syntax',
  description: 'Check Python code for syntax errors. Returns "OK" or a description of syntax errors found.',
  schema: z.object({ code: z.string().describe('Python source code to check') }),
  func: async ({ code }) => {
    // Simple heuristic syntax checks (simulated, since we cannot run Python AST in TS)
    const issues: string[] = [];
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (/^\s*(def|class|if|elif|else|for|while|try|except|with)\b/.test(line) && !line.endsWith(':')) {
        issues.push(`Line ${i + 1}: missing colon at end of statement`);
      }
    }
    // Check for unmatched parentheses
    let parenDepth = 0;
    for (const ch of code) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
    }
    if (parenDepth !== 0) issues.push('Unmatched parentheses');

    return issues.length === 0
      ? 'Syntax: OK — no syntax errors detected.'
      : `Syntax issues:\n${issues.map((i) => `  - ${i}`).join('\n')}`;
  },
});

const checkComplexity = new DynamicStructuredTool({
  name: 'check_complexity',
  description: 'Estimate the cyclomatic complexity of Python code. Counts branches (if, for, while, try, and, or) as a rough complexity proxy.',
  schema: z.object({ code: z.string().describe('Python source code to analyze') }),
  func: async ({ code }) => {
    let complexity = 1; // base
    const branchPatterns = [/\bif\b/, /\belif\b/, /\bfor\b/, /\bwhile\b/, /\bexcept\b/, /\bwith\b/, /\bassert\b/];
    const boolPatterns = [/\band\b/, /\bor\b/];
    for (const line of code.split('\n')) {
      for (const pattern of branchPatterns) {
        if (pattern.test(line)) complexity++;
      }
      for (const pattern of boolPatterns) {
        if (pattern.test(line)) complexity++;
      }
    }

    let rating: string;
    if (complexity <= 5) rating = 'Low (good)';
    else if (complexity <= 10) rating = 'Medium (acceptable)';
    else rating = 'High (consider refactoring)';

    return `Cyclomatic complexity: ${complexity} — ${rating}`;
  },
});

const checkNamingConventions = new DynamicStructuredTool({
  name: 'check_naming_conventions',
  description: 'Check if function and variable names follow Python PEP 8 snake_case conventions.',
  schema: z.object({ code: z.string().describe('Python source code to check') }),
  func: async ({ code }) => {
    const issues: string[] = [];
    // Check function names
    const funcPattern = /^\s*def\s+(\w+)/gm;
    let match;
    while ((match = funcPattern.exec(code)) !== null) {
      const name = match[1];
      if (name !== name.toLowerCase() && !name.startsWith('_') && !['setUp', 'tearDown'].includes(name)) {
        issues.push(`Function '${name}' should be snake_case`);
      }
    }
    // Check class names
    const classPattern = /^\s*class\s+(\w+)/gm;
    while ((match = classPattern.exec(code)) !== null) {
      const name = match[1];
      if (name[0] !== name[0].toUpperCase()) {
        issues.push(`Class '${name}' should be PascalCase`);
      }
    }

    return issues.length > 0
      ? `Naming issues:\n${issues.map((i) => `  - ${i}`).join('\n')}`
      : 'Naming conventions: OK — all names follow PEP 8.';
  },
});

const checkDocstrings = new DynamicStructuredTool({
  name: 'check_docstrings',
  description: 'Check whether functions and classes have docstrings.',
  schema: z.object({ code: z.string().describe('Python source code to check') }),
  func: async ({ code }) => {
    const missing: string[] = [];
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const defMatch = trimmed.match(/^(def|class)\s+(\w+)/);
      if (defMatch) {
        const kind = defMatch[1] === 'def' ? 'Function' : 'Class';
        const name = defMatch[2];
        // Check if next non-empty line is a docstring
        let nextLine = '';
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().length > 0) {
            nextLine = lines[j].trim();
            break;
          }
        }
        if (!nextLine.startsWith('"""') && !nextLine.startsWith("'''")) {
          missing.push(`${kind} '${name}'`);
        }
      }
    }

    return missing.length > 0
      ? `Missing docstrings in:\n${missing.map((m) => `  - ${m}`).join('\n')}`
      : 'Docstrings: OK — all functions and classes are documented.';
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [checkSyntax, checkComplexity, checkNamingConventions, checkDocstrings];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const CODE_REVIEWER_SYSTEM =
  'You are an expert code reviewer. When given code to review:\n' +
  '1. Run ALL available checks (syntax, complexity, naming, docstrings)\n' +
  '2. Summarize findings with severity (critical/warning/info)\n' +
  '3. Provide an overall score out of 10\n' +
  '4. List the top 3 improvements';

async function runAgentLoop(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(CODE_REVIEWER_SYSTEM),
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

const SAMPLE_CODE = `
def calculateTotal(items, TaxRate):
    total = 0
    for item in items:
        if item["price"] > 0:
            total += item["price"]
            if item.get("discount"):
                total -= item["discount"]
    return total * (1 + TaxRate)

class shoppingCart:
    def addItem(self, item):
        self.items.append(item)

    def removeItem(self, item_id):
        self.items = [i for i in self.items if i["id"] != item_id]
`;

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      `Please review this Python code:\n\n\`\`\`python\n${SAMPLE_CODE}\n\`\`\``,
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('11-code-review-agent.ts') || process.argv[1]?.endsWith('11-code-review-agent.js')) {
  main().catch(console.error);
}
