/**
 * Non-blocking event push for framework passthrough workers.
 *
 * Pushes events to POST /agent/{workflowId}/events.
 * Only 6 event types are supported by the server:
 *   thinking, tool_call, tool_result, context_condensed, subagent_start, subagent_stop
 * Unknown types are silently dropped by the server.
 */

/** The set of event types accepted by the server. */
export const SUPPORTED_EVENT_TYPES = new Set([
  'thinking',
  'tool_call',
  'tool_result',
  'context_condensed',
  'subagent_start',
  'subagent_stop',
]);

/**
 * Fire-and-forget push of an event to the agentspan server.
 * Does NOT await the fetch — errors are silently swallowed (debug log only).
 */
export function pushEvent(
  workflowId: string,
  event: Record<string, unknown>,
  serverUrl: string,
  headers: Record<string, string>,
): void {
  // Fire-and-forget — do NOT await
  fetch(`${serverUrl}/agent/${workflowId}/events`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify([event]),
  }).catch(() => {
    // Silently drop — debug log only
  });
}
