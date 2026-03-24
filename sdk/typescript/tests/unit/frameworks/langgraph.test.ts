import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLangGraphWorker } from '../../../src/frameworks/langgraph.js';
import * as eventPush from '../../../src/frameworks/event-push.js';

// Mock pushEvent to track calls
vi.mock('../../../src/frameworks/event-push.js', () => ({
  pushEvent: vi.fn(),
  SUPPORTED_EVENT_TYPES: new Set([
    'thinking', 'tool_call', 'tool_result',
    'context_condensed', 'subagent_start', 'subagent_stop',
  ]),
}));

describe('makeLangGraphWorker', () => {
  const serverUrl = 'http://localhost:8080/api';
  const headers = { Authorization: 'Bearer test-key' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dual-stream mode', () => {
    it('processes updates and values chunks from dual-stream', async () => {
      const mockGraph = {
        invoke: vi.fn(),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          // Yield [mode, chunk] tuples
          yield ['updates', {
            agent: {
              messages: [
                {
                  role: 'ai',
                  content: 'Thinking...',
                  tool_calls: [
                    { name: 'search', args: { query: 'test' } },
                  ],
                },
              ],
            },
          }];
          yield ['updates', {
            tools: {
              messages: [
                { role: 'tool', name: 'search', content: 'Found results' },
              ],
            },
          }];
          yield ['values', {
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'ai', content: 'The final answer is 42' },
            ],
          }];
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-123');

      // Verify stream was called with correct args
      expect(mockGraph.stream).toHaveBeenCalledTimes(1);
      const streamArgs = mockGraph.stream.mock.calls[0];
      expect(streamArgs[1]).toEqual(
        expect.objectContaining({
          streamMode: ['updates', 'values'],
        }),
      );

      // Verify events were pushed
      // Update 1: thinking event for 'agent' node + tool_call for search
      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-123',
        { type: 'thinking', content: '[agent]' },
        serverUrl,
        headers,
      );
      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-123',
        { type: 'tool_call', toolName: 'search', args: { query: 'test' } },
        serverUrl,
        headers,
      );

      // Update 2: thinking event for 'tools' node + tool_result
      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-123',
        { type: 'thinking', content: '[tools]' },
        serverUrl,
        headers,
      );
      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-123',
        { type: 'tool_result', toolName: 'search', result: 'Found results' },
        serverUrl,
        headers,
      );

      // Verify final result extracted from last AI message
      expect(result).toEqual({
        status: 'COMPLETED',
        outputData: { result: 'The final answer is 42' },
      });
    });

    it('passes session_id as thread_id in config', async () => {
      const mockGraph = {
        invoke: vi.fn(),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield ['values', { messages: [{ role: 'ai', content: 'OK' }] }];
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      await worker({ prompt: 'Hello', session_id: 'session-abc' }, 'wf-456');

      const streamArgs = mockGraph.stream.mock.calls[0];
      expect(streamArgs[1]).toEqual(
        expect.objectContaining({
          configurable: { thread_id: 'session-abc' },
          streamMode: ['updates', 'values'],
        }),
      );
    });

    it('handles stream with only values (no updates)', async () => {
      const mockGraph = {
        invoke: vi.fn(),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield ['values', { output: 'Final result' }];
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-values');

      expect(result).toEqual({
        status: 'COMPLETED',
        outputData: { result: 'Final result' },
      });
      expect(eventPush.pushEvent).not.toHaveBeenCalled();
    });
  });

  describe('invoke fallback', () => {
    it('falls back to invoke when stream fails', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({
          messages: [
            { role: 'ai', content: 'Fallback response' },
          ],
        }),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(() => {
          throw new Error('Stream not supported');
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-fallback');

      expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'COMPLETED',
        outputData: { result: 'Fallback response' },
      });
    });

    it('uses invoke when stream method is not available', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({
          messages: [
            { role: 'ai', content: 'Invoke response' },
          ],
        }),
        getGraph: vi.fn(),
        // No stream method
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-no-stream');

      expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'COMPLETED',
        outputData: { result: 'Invoke response' },
      });
    });
  });

  describe('input format detection', () => {
    it('uses messages format when graph has messages channel', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({ output: 'ok' }),
        getGraph: vi.fn(),
        builder: { channels: { messages: {} } },
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      await worker({ prompt: 'Hello' }, 'wf-msg');

      expect(mockGraph.invoke).toHaveBeenCalledWith(
        { messages: [{ role: 'user', content: 'Hello' }] },
        {},
      );
    });

    it('uses simple input format when no messages channel', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({ output: 'ok' }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      await worker({ prompt: 'Hello' }, 'wf-simple');

      expect(mockGraph.invoke).toHaveBeenCalledWith(
        { input: 'Hello' },
        {},
      );
    });
  });

  describe('output extraction', () => {
    it('extracts output from last AI message', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'ai', content: 'Hi there!' },
          ],
        }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-extract');

      expect(result.outputData.result).toBe('Hi there!');
    });

    it('extracts output from assistant role message', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi from assistant!' },
          ],
        }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-asst');

      expect(result.outputData.result).toBe('Hi from assistant!');
    });

    it('extracts output from output key when no messages', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({ output: 'Direct output' }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-output');

      expect(result.outputData.result).toBe('Direct output');
    });

    it('serializes full state when no messages or output key', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({ counter: 5, status: 'done' }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-full');

      expect(result.outputData.result).toBe(JSON.stringify({ counter: 5, status: 'done' }));
    });

    it('returns empty string for null state', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue(null),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'Hello' }, 'wf-null');

      expect(result.outputData.result).toBe('');
    });
  });

  describe('error handling', () => {
    it('propagates errors from invoke', async () => {
      const mockGraph = {
        invoke: vi.fn().mockRejectedValue(new Error('Graph execution failed')),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      await expect(worker({ prompt: 'test' }, 'wf-err')).rejects.toThrow('Graph execution failed');
    });

    it('handles empty prompt', async () => {
      const mockGraph = {
        invoke: vi.fn().mockResolvedValue({ output: 'ok' }),
        getGraph: vi.fn(),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({}, 'wf-empty');

      expect(mockGraph.invoke).toHaveBeenCalledWith({ input: '' }, {});
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('event mapping from updates', () => {
    it('pushes thinking event for each node in updates', async () => {
      const mockGraph = {
        invoke: vi.fn(),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield ['updates', {
            planner: { messages: [] },
            executor: { messages: [] },
          }];
          yield ['values', { output: 'done' }];
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      await worker({ prompt: 'test' }, 'wf-nodes');

      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-nodes',
        { type: 'thinking', content: '[planner]' },
        serverUrl,
        headers,
      );
      expect(eventPush.pushEvent).toHaveBeenCalledWith(
        'wf-nodes',
        { type: 'thinking', content: '[executor]' },
        serverUrl,
        headers,
      );
    });

    it('handles single-stream mode items (non-tuple)', async () => {
      const mockGraph = {
        invoke: vi.fn(),
        getGraph: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          // Single-stream mode: yields state directly
          yield { messages: [{ role: 'ai', content: 'Intermediate' }] };
          yield { messages: [{ role: 'ai', content: 'Final' }] };
        }),
      };

      const worker = makeLangGraphWorker(mockGraph, 'test-worker', serverUrl, headers);
      const result = await worker({ prompt: 'test' }, 'wf-single');

      // Last item should be treated as final state
      expect(result.outputData.result).toBe('Final');
    });
  });
});
