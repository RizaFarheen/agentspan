/**
 * Google ADK passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Uses InMemoryRunner + InMemorySessionService to execute the ADK agent
 * 2. Pushes events via pushEvent
 * 3. Returns result
 *
 * Note: The TS ADK LlmAgent does NOT have a .run() method.
 * Execution uses InMemoryRunner + InMemorySessionService.
 */

import { pushEvent } from './event-push.js';
import type { FrameworkWorkerFn } from './vercel-ai.js';

/**
 * Create a passthrough worker for a Google ADK agent.
 *
 * @param agent - Google ADK LlmAgent instance (duck-typed)
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

    // Import ADK runner classes dynamically to avoid hard dependency at module level
    let InMemoryRunner: any;
    let InMemorySessionService: any;
    try {
      const adk = await import('@google/adk');
      InMemoryRunner = adk.InMemoryRunner;
      InMemorySessionService = adk.InMemorySessionService;
    } catch {
      throw new Error(
        'Google ADK (@google/adk) is required for ADK agent execution. Install with: npm install @google/adk',
      );
    }

    const sessionService = new InMemorySessionService();
    const runner = new InMemoryRunner({
      agent,
      appName: name,
      sessionService,
    });

    const session = await sessionService.createSession({
      appName: name,
      userId: 'agentspan-user',
    });

    const content = { role: 'user', parts: [{ text: prompt }] };

    let output = '';
    for await (const event of runner.runAsync({
      userId: 'agentspan-user',
      sessionId: session.id,
      newMessage: content,
    })) {
      // ADK events have various shapes; extract text from the last model response
      const parts = event?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part?.text === 'string') {
            output = part.text;
          }
        }
      }
    }

    return {
      status: 'COMPLETED',
      outputData: { result: output },
    };
  };
}
