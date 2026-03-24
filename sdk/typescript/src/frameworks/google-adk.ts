/**
 * Google ADK passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Calls agent.run(prompt) with event mapping
 * 2. Pushes events via pushEvent
 * 3. Returns result
 */

import { pushEvent } from './event-push.js';
import type { FrameworkWorkerFn } from './vercel-ai.js';

/**
 * Create a passthrough worker for a Google ADK agent.
 *
 * @param agent - Google ADK agent (duck-typed, has .run() + Google markers)
 * @param name - Worker name for task registration
 * @param serverUrl - Agentspan server URL
 * @param headers - Auth headers for event push
 */
export function makeGoogleADKWorker(
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
      { type: 'thinking', content: 'Agent reasoning...' },
      serverUrl,
      headers,
    );

    const result = await agent.run(prompt);

    // Extract output from result
    let output: string;
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      // Google ADK typically returns { output, ... } or { response, ... }
      output =
        typeof r.output === 'string'
          ? r.output
          : typeof r.response === 'string'
            ? r.response
            : typeof r.text === 'string'
              ? r.text
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
  };
}
