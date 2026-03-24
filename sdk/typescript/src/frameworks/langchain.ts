/**
 * LangChain.js passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Creates a callback handler that pushes events to agentspan
 * 2. Calls executor.invoke({ input: prompt }, { callbacks: [handler] })
 * 3. Extracts output from the result
 */

import { pushEvent } from './event-push.js';
import type { FrameworkWorkerFn } from './vercel-ai.js';

/**
 * Create an agentspan-compatible callback handler for LangChain.
 * Maps LangChain callback events to agentspan SSE events.
 */
function createCallbackHandler(
  workflowId: string,
  serverUrl: string,
  headers: Record<string, string>,
): Record<string, Function> {
  return {
    handleLLMStart(_llm: unknown, _prompts: unknown): void {
      pushEvent(
        workflowId,
        { type: 'thinking', content: 'LLM reasoning...' },
        serverUrl,
        headers,
      );
    },

    handleToolStart(
      tool: Record<string, unknown>,
      input: string,
    ): void {
      const toolName = (tool?.name as string) ?? 'unknown';
      let args: Record<string, unknown> = {};
      try {
        args = typeof input === 'string' ? JSON.parse(input) : { input };
      } catch {
        args = { input };
      }
      pushEvent(
        workflowId,
        { type: 'tool_call', toolName, args },
        serverUrl,
        headers,
      );
    },

    handleToolEnd(output: unknown): void {
      pushEvent(
        workflowId,
        { type: 'tool_result', result: output },
        serverUrl,
        headers,
      );
    },
  };
}

/**
 * Create a passthrough worker for a LangChain.js executor/runnable.
 *
 * @param executor - LangChain agent executor or runnable (duck-typed, has .invoke() + .lc_namespace)
 * @param name - Worker name for task registration
 * @param serverUrl - Agentspan server URL
 * @param headers - Auth headers for event push
 */
export function makeLangChainWorker(
  executor: any,
  name: string,
  serverUrl: string,
  headers: Record<string, string>,
): FrameworkWorkerFn {
  return async (
    taskInput: Record<string, unknown>,
    workflowInstanceId: string,
  ) => {
    const prompt = (taskInput.prompt as string) ?? '';

    const handler = createCallbackHandler(workflowInstanceId, serverUrl, headers);

    const result = await executor.invoke(
      { input: prompt },
      { callbacks: [handler] },
    );

    // Extract output from result
    let output: string;
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      output = typeof r.output === 'string'
        ? r.output
        : typeof r.result === 'string'
          ? r.result
          : JSON.stringify(r);
    } else {
      output = String(result);
    }

    return {
      status: 'COMPLETED',
      outputData: { result: output },
    };
  };
}
