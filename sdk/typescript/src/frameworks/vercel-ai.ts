/**
 * Vercel AI SDK passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Calls agent.generate({ prompt, onStepFinish })
 * 2. Maps onStepFinish events to agentspan SSE events (tool_call, tool_result, thinking)
 * 3. Pushes events via pushEvent (non-blocking)
 * 4. Returns { status: 'COMPLETED', outputData: { result: result.text } }
 */

import { pushEvent } from './event-push.js';

/**
 * Shape of the worker function returned by factory functions.
 */
export type FrameworkWorkerFn = (
  taskInput: Record<string, unknown>,
  workflowInstanceId: string,
) => Promise<{ status: string; outputData: Record<string, unknown> }>;

/**
 * Create a passthrough worker for a Vercel AI SDK agent.
 *
 * @param agent - Vercel AI SDK agent (duck-typed, has .generate())
 * @param name - Worker name for task registration
 * @param serverUrl - Agentspan server URL
 * @param headers - Auth headers for event push
 */
export function makeVercelAIWorker(
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

    const result = await agent.generate({
      prompt,
      onStepFinish: (step: any) => {
        const { text, toolCalls, toolResults } = step ?? {};

        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            pushEvent(
              workflowInstanceId,
              {
                type: 'tool_call',
                toolName: tc.toolName,
                args: tc.args,
              },
              serverUrl,
              headers,
            );
          }
        }

        if (toolResults?.length) {
          for (const tr of toolResults) {
            pushEvent(
              workflowInstanceId,
              {
                type: 'tool_result',
                toolName: tr.toolName,
                result: tr.result,
              },
              serverUrl,
              headers,
            );
          }
        }

        if (text) {
          pushEvent(
            workflowInstanceId,
            { type: 'thinking', content: text },
            serverUrl,
            headers,
          );
        }
      },
    });

    return {
      status: 'COMPLETED',
      outputData: { result: result.text },
    };
  };
}
