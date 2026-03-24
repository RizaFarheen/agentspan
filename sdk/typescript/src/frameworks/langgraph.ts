/**
 * LangGraph.js passthrough worker factory.
 *
 * Creates a worker function that:
 * 1. Builds input format based on graph schema detection
 * 2. Streams using dual streamMode ['updates', 'values'] if available, falls back to invoke()
 * 3. Maps node updates to thinking/tool_call/tool_result events
 * 4. Extracts output from final state
 */

import { pushEvent } from './event-push.js';
import type { FrameworkWorkerFn } from './vercel-ai.js';

/**
 * Build the input object for a LangGraph graph.
 * If the graph appears to use a messages schema, wrap as a message.
 * Otherwise use simple { input: prompt } format.
 */
function buildLangGraphInput(graph: any, prompt: string): Record<string, unknown> {
  // Detect if graph uses messages schema (channels/schema has 'messages' key)
  const hasMessagesSchema =
    graph?.builder?.channels?.messages != null ||
    graph?.channels?.messages != null ||
    graph?.schema?.messages != null;

  if (hasMessagesSchema) {
    return { messages: [{ role: 'user', content: prompt }] };
  }
  return { input: prompt };
}

/**
 * Extract the final output from a LangGraph state object.
 * Looks for messages array (returns last AI message content) or serializes the full state.
 */
function extractOutput(state: unknown): string {
  if (state == null) return '';

  const s = state as Record<string, unknown>;

  // Look for messages array — extract last AI/assistant message content
  if (Array.isArray(s.messages) && s.messages.length > 0) {
    // Walk backwards to find the last AI message
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const msg = s.messages[i];
      if (msg && typeof msg === 'object') {
        const m = msg as Record<string, unknown>;
        const role = m.role ?? m.type ?? '';
        if (role === 'ai' || role === 'assistant') {
          return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        }
      }
    }
    // Fallback: last message content regardless of role
    const lastMsg = s.messages[s.messages.length - 1];
    if (lastMsg && typeof lastMsg === 'object') {
      const content = (lastMsg as Record<string, unknown>).content;
      return typeof content === 'string' ? content : JSON.stringify(content);
    }
  }

  // If state has an 'output' key, use that
  if (s.output != null) {
    return typeof s.output === 'string' ? s.output : JSON.stringify(s.output);
  }

  // Fallback: serialize the full state
  return JSON.stringify(state);
}

/**
 * Process an 'updates' chunk from LangGraph streaming.
 * Maps node names to thinking events and extracts tool call/result events from messages.
 */
function processUpdatesChunk(
  chunk: Record<string, unknown>,
  workflowId: string,
  serverUrl: string,
  headers: Record<string, string>,
): void {
  for (const [nodeName, nodeData] of Object.entries(chunk)) {
    // Emit thinking event for node execution
    pushEvent(
      workflowId,
      { type: 'thinking', content: `[${nodeName}]` },
      serverUrl,
      headers,
    );

    // Extract tool calls and results from messages if present
    if (nodeData && typeof nodeData === 'object') {
      const data = nodeData as Record<string, unknown>;
      const messages = Array.isArray(data.messages) ? data.messages : [];

      for (const msg of messages) {
        if (msg == null || typeof msg !== 'object') continue;
        const m = msg as Record<string, unknown>;

        // AI message with tool_calls
        if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            if (tc && typeof tc === 'object') {
              pushEvent(
                workflowId,
                {
                  type: 'tool_call',
                  toolName: (tc as Record<string, unknown>).name as string,
                  args: (tc as Record<string, unknown>).args as Record<string, unknown>,
                },
                serverUrl,
                headers,
              );
            }
          }
        }

        // Tool message (tool result)
        const msgType = m.role ?? m.type ?? '';
        if (msgType === 'tool') {
          pushEvent(
            workflowId,
            {
              type: 'tool_result',
              toolName: (m.name as string) ?? 'unknown',
              result: m.content,
            },
            serverUrl,
            headers,
          );
        }
      }
    }
  }
}

/**
 * Create a passthrough worker for a LangGraph.js compiled graph.
 *
 * @param graph - LangGraph compiled graph (duck-typed, has .invoke() and .getGraph()/.nodes)
 * @param name - Worker name for task registration
 * @param serverUrl - Agentspan server URL
 * @param headers - Auth headers for event push
 */
export function makeLangGraphWorker(
  graph: any,
  name: string,
  serverUrl: string,
  headers: Record<string, string>,
): FrameworkWorkerFn {
  return async (
    taskInput: Record<string, unknown>,
    workflowInstanceId: string,
  ) => {
    const prompt = (taskInput.prompt as string) ?? '';
    const sessionId = taskInput.session_id as string | undefined;
    const input = buildLangGraphInput(graph, prompt);

    const config: Record<string, unknown> = {};
    if (sessionId) {
      config.configurable = { thread_id: sessionId };
    }

    // Try dual-stream mode first, fallback to invoke
    let finalState: unknown;
    const hasStream = typeof graph.stream === 'function';

    if (hasStream) {
      try {
        const streamIterator = graph.stream(input, {
          ...config,
          streamMode: ['updates', 'values'],
        });

        for await (const item of streamIterator) {
          // Dual-stream items are [mode, chunk] tuples
          if (Array.isArray(item) && item.length === 2) {
            const [mode, chunk] = item;
            if (mode === 'updates' && chunk && typeof chunk === 'object') {
              processUpdatesChunk(
                chunk as Record<string, unknown>,
                workflowInstanceId,
                serverUrl,
                headers,
              );
            } else if (mode === 'values') {
              finalState = chunk;
            }
          } else {
            // Single-stream mode fallback — treat as values
            finalState = item;
          }
        }
      } catch {
        // Fallback to invoke if stream fails
        finalState = await graph.invoke(input, config);
      }
    } else {
      // No stream method — use invoke
      finalState = await graph.invoke(input, config);
    }

    return {
      status: 'COMPLETED',
      outputData: { result: extractOutput(finalState) },
    };
  };
}
