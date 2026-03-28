import { describe, it, expect } from 'vitest';
import { Agent, AgentRuntime, tool, ClaudeCode, getToolDef } from '../../sdk/typescript/src/index.js';

const MODEL = 'openai/gpt-4o-mini';

// Tools
const addNumbers = tool(
  async ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
  { name: 'add_numbers', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
);

describe('TypeScript SDK E2E', () => {
  describe('Positive', () => {
    it('agent with tool completes', async () => {
      const agent = new Agent({ name: 'ts_calc', model: MODEL, instructions: 'Use add_numbers.', tools: [addNumbers] });
      const rt = new AgentRuntime();
      const result = await rt.run(agent, 'What is 2 + 3?', { timeout: 60000 });
      expect(result.status).toBe('COMPLETED');
    });

    it('CLI tool names are agent-prefixed', () => {
      const agent = new Agent({ name: 'ts_cli', model: MODEL, cliCommands: true, cliAllowedCommands: ['echo'] });
      const toolNames = agent.tools.map((t: unknown) => {
        try {
          return getToolDef(t).name;
        } catch {
          return typeof t === 'string' ? t : undefined;
        }
      }).filter(Boolean);
      expect(toolNames).toContain('ts_cli_run_command');
    });
  });

  describe('Negative', () => {
    it('claude-code rejects callable tools', () => {
      expect(() => new Agent({
        name: 'bad', model: new ClaudeCode('opus'), instructions: 'test', tools: [addNumbers],
      })).toThrow();
    });

    it('invalid agent name rejected', () => {
      expect(() => new Agent({ name: 'bad name spaces', model: MODEL })).toThrow();
    });

    it('router without router param rejected', () => {
      expect(() => new Agent({
        name: 'bad_router', model: MODEL, strategy: 'router',
        agents: [new Agent({ name: 'sub', model: MODEL })],
      })).toThrow();
    });

    it('duplicate sub-agent names rejected', () => {
      expect(() => new Agent({
        name: 'parent', model: MODEL,
        agents: [new Agent({ name: 'dup', model: MODEL }), new Agent({ name: 'dup', model: MODEL })],
      })).toThrow(/[Dd]uplicate/);
    });
  });
});
