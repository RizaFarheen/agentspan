/**
 * OpenAI Agents SDK passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Dynamically imports `run` from `@openai/agents`
 * 2. Calls run(agent, prompt) — run() is a standalone function, not a method
 * 3. Pushes events via pushEvent
 * 4. Returns result
 */

import { pushEvent } from './event-push.js';
import type { FrameworkWorkerFn } from './vercel-ai.js';

/**
 * Create a passthrough worker for an OpenAI Agents SDK agent.
 *
 * @param agent - OpenAI Agents SDK Agent instance (has .name, .instructions, .model, .tools)
 * @param name - Worker name for task registration
 * @param serverUrl - Agentspan server URL
 * @param headers - Auth headers for event push
 */
export function makeOpenAIAgentsWorker(
  agent: any,
  name: string,
  serverUrl: string,
  headers: Record<string, string>,
): FrameworkWorkerFn {
  return async (
    taskInput: Record<string, unknown>,
    workflowInstanceId: string,
  ) => {
    const prompt = (taskInput.prompt as string) ?? '';

    pushEvent(
      workflowInstanceId,
      { type: 'thinking', content: `OpenAI Agent "${agent.name}" processing...` },
      serverUrl,
      headers,
    );

    try {
      // Dynamically import run() from @openai/agents
      // run() is a standalone function, NOT a method on Agent
      const { run } = await import('@openai/agents');

      const result = await run(agent, prompt);

      // Extract output — OpenAI Agents SDK returns RunResult with finalOutput
      let output: string;
      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        output =
          typeof r.finalOutput === 'string'
            ? r.finalOutput
            : typeof r.final_output === 'string'
              ? (r.final_output as string)
              : typeof r.output === 'string'
                ? r.output
                : JSON.stringify(r);
      } else if (typeof result === 'string') {
        output = result;
      } else {
        output = String(result ?? '');
      }

      return {
        status: 'COMPLETED',
        outputData: { result: output },
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        outputData: { error: err.message ?? String(err) },
      };
    }
  };
}
