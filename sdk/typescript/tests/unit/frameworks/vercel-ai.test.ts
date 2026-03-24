import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeVercelAIWorker } from '../../../src/frameworks/vercel-ai.js';
import * as eventPush from '../../../src/frameworks/event-push.js';

// Mock pushEvent to track calls
vi.mock('../../../src/frameworks/event-push.js', () => ({
  pushEvent: vi.fn(),
  SUPPORTED_EVENT_TYPES: new Set([
    'thinking', 'tool_call', 'tool_result',
    'context_condensed', 'subagent_start', 'subagent_stop',
  ]),
}));

describe('makeVercelAIWorker', () => {
  const serverUrl = 'http://localhost:8080/api';
  const headers = { Authorization: 'Bearer test-key' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls agent.generate with prompt and onStepFinish', async () => {
    const mockAgent = {
      generate: vi.fn().mockResolvedValue({ text: 'Hello from AI' }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'Say hello' }, 'wf-123');

    expect(mockAgent.generate).toHaveBeenCalledTimes(1);
    const callArgs = mockAgent.generate.mock.calls[0][0];
    expect(callArgs.prompt).toBe('Say hello');
    expect(typeof callArgs.onStepFinish).toBe('function');
  });

  it('returns COMPLETED status with result text', async () => {
    const mockAgent = {
      generate: vi.fn().mockResolvedValue({ text: 'The answer is 42' }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'What is the meaning of life?' }, 'wf-123');

    expect(result).toEqual({
      status: 'COMPLETED',
      outputData: { result: 'The answer is 42' },
    });
  });

  it('pushes tool_call events for toolCalls in onStepFinish', async () => {
    let capturedOnStepFinish: Function;

    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        capturedOnStepFinish = opts.onStepFinish;
        // Simulate a step with tool calls
        capturedOnStepFinish({
          toolCalls: [
            { toolName: 'search', args: { query: 'test' } },
            { toolName: 'fetch', args: { url: 'http://example.com' } },
          ],
          toolResults: [],
          text: '',
        });
        return { text: 'Done' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'Search for something' }, 'wf-456');

    // Should have pushed 2 tool_call events
    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-456',
      { type: 'tool_call', toolName: 'search', args: { query: 'test' } },
      serverUrl,
      headers,
    );
    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-456',
      { type: 'tool_call', toolName: 'fetch', args: { url: 'http://example.com' } },
      serverUrl,
      headers,
    );
  });

  it('pushes tool_result events for toolResults in onStepFinish', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        opts.onStepFinish({
          toolCalls: [],
          toolResults: [
            { toolName: 'search', result: 'Found 3 results' },
          ],
          text: '',
        });
        return { text: 'Done' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'Search' }, 'wf-789');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-789',
      { type: 'tool_result', toolName: 'search', result: 'Found 3 results' },
      serverUrl,
      headers,
    );
  });

  it('pushes thinking events for text in onStepFinish', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        opts.onStepFinish({
          toolCalls: [],
          toolResults: [],
          text: 'Let me think about this...',
        });
        return { text: 'Final answer' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'Think hard' }, 'wf-think');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-think',
      { type: 'thinking', content: 'Let me think about this...' },
      serverUrl,
      headers,
    );
  });

  it('handles all event types in a single step', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        opts.onStepFinish({
          toolCalls: [{ toolName: 'calc', args: { expr: '2+2' } }],
          toolResults: [{ toolName: 'calc', result: '4' }],
          text: 'Computing...',
        });
        return { text: 'Result is 4' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'Calculate' }, 'wf-all');

    // Should have 3 pushEvent calls: tool_call, tool_result, thinking
    expect(eventPush.pushEvent).toHaveBeenCalledTimes(3);
  });

  it('handles empty prompt gracefully', async () => {
    const mockAgent = {
      generate: vi.fn().mockResolvedValue({ text: 'OK' }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    const result = await worker({}, 'wf-empty');

    expect(mockAgent.generate).toHaveBeenCalledTimes(1);
    const callArgs = mockAgent.generate.mock.calls[0][0];
    expect(callArgs.prompt).toBe('');
    expect(result.status).toBe('COMPLETED');
  });

  it('does not push events when step has no data', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        opts.onStepFinish({
          toolCalls: [],
          toolResults: [],
          text: '',
        });
        return { text: 'Done' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'test' }, 'wf-noop');

    expect(eventPush.pushEvent).not.toHaveBeenCalled();
  });

  it('handles null/undefined step fields gracefully', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        opts.onStepFinish({});
        opts.onStepFinish(null);
        opts.onStepFinish(undefined);
        return { text: 'Done' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-null');

    expect(result.status).toBe('COMPLETED');
    expect(eventPush.pushEvent).not.toHaveBeenCalled();
  });

  it('propagates errors from agent.generate', async () => {
    const mockAgent = {
      generate: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    await expect(worker({ prompt: 'test' }, 'wf-err')).rejects.toThrow('API rate limit exceeded');
  });

  it('handles multiple steps with events', async () => {
    const mockAgent = {
      generate: vi.fn().mockImplementation(async (opts: any) => {
        // Step 1: thinking
        opts.onStepFinish({ text: 'Analyzing...' });
        // Step 2: tool call + result
        opts.onStepFinish({
          toolCalls: [{ toolName: 'search', args: { q: 'test' } }],
          toolResults: [{ toolName: 'search', result: 'found' }],
          text: '',
        });
        // Step 3: final thinking
        opts.onStepFinish({ text: 'Summarizing results' });
        return { text: 'Summary' };
      }),
    };

    const worker = makeVercelAIWorker(mockAgent, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-multi');

    // 1 thinking + 1 tool_call + 1 tool_result + 1 thinking = 4
    expect(eventPush.pushEvent).toHaveBeenCalledTimes(4);
    expect(result.outputData.result).toBe('Summary');
  });
});
