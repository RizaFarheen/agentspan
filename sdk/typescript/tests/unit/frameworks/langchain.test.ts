import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLangChainWorker } from '../../../src/frameworks/langchain.js';
import * as eventPush from '../../../src/frameworks/event-push.js';

// Mock pushEvent to track calls
vi.mock('../../../src/frameworks/event-push.js', () => ({
  pushEvent: vi.fn(),
  SUPPORTED_EVENT_TYPES: new Set([
    'thinking', 'tool_call', 'tool_result',
    'context_condensed', 'subagent_start', 'subagent_stop',
  ]),
}));

describe('makeLangChainWorker', () => {
  const serverUrl = 'http://localhost:8080/api';
  const headers = { Authorization: 'Bearer test-key' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls executor.invoke with input and callback handler', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue({ output: 'Agent response' }),
      lc_namespace: ['langchain', 'agents'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'Hello' }, 'wf-123');

    expect(mockExecutor.invoke).toHaveBeenCalledTimes(1);
    const [input, config] = mockExecutor.invoke.mock.calls[0];
    expect(input).toEqual({ input: 'Hello' });
    expect(config.callbacks).toBeDefined();
    expect(config.callbacks).toHaveLength(1);
  });

  it('returns COMPLETED status with output from result.output', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue({ output: 'The answer' }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-456');

    expect(result).toEqual({
      status: 'COMPLETED',
      outputData: { result: 'The answer' },
    });
  });

  it('extracts result from result.result key when output is missing', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue({ result: 'Alt result' }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-alt');

    expect(result.outputData.result).toBe('Alt result');
  });

  it('serializes result when output is not a string', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue({ data: [1, 2, 3] }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-obj');

    expect(result.outputData.result).toBe(JSON.stringify({ data: [1, 2, 3] }));
  });

  it('stringifies non-object results', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue('Plain string result'),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({ prompt: 'test' }, 'wf-str');

    expect(result.outputData.result).toBe('Plain string result');
  });

  it('callback handler pushes thinking event on handleLLMStart', async () => {
    let capturedHandler: any;

    const mockExecutor = {
      invoke: vi.fn().mockImplementation(async (input: any, config: any) => {
        capturedHandler = config.callbacks[0];
        // Simulate LangChain calling the callbacks
        capturedHandler.handleLLMStart({}, ['prompt']);
        return { output: 'Done' };
      }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'test' }, 'wf-llm');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-llm',
      { type: 'thinking', content: 'LLM reasoning...' },
      serverUrl,
      headers,
    );
  });

  it('callback handler pushes tool_call event on handleToolStart', async () => {
    let capturedHandler: any;

    const mockExecutor = {
      invoke: vi.fn().mockImplementation(async (_input: any, config: any) => {
        capturedHandler = config.callbacks[0];
        capturedHandler.handleToolStart(
          { name: 'calculator' },
          JSON.stringify({ expression: '2+2' }),
        );
        return { output: 'Done' };
      }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'test' }, 'wf-tool');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-tool',
      {
        type: 'tool_call',
        toolName: 'calculator',
        args: { expression: '2+2' },
      },
      serverUrl,
      headers,
    );
  });

  it('callback handler handles non-JSON tool input', async () => {
    let capturedHandler: any;

    const mockExecutor = {
      invoke: vi.fn().mockImplementation(async (_input: any, config: any) => {
        capturedHandler = config.callbacks[0];
        capturedHandler.handleToolStart({ name: 'search' }, 'plain text query');
        return { output: 'Done' };
      }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'test' }, 'wf-plain');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-plain',
      {
        type: 'tool_call',
        toolName: 'search',
        args: { input: 'plain text query' },
      },
      serverUrl,
      headers,
    );
  });

  it('callback handler pushes tool_result event on handleToolEnd', async () => {
    let capturedHandler: any;

    const mockExecutor = {
      invoke: vi.fn().mockImplementation(async (_input: any, config: any) => {
        capturedHandler = config.callbacks[0];
        capturedHandler.handleToolEnd('Tool output result');
        return { output: 'Done' };
      }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    await worker({ prompt: 'test' }, 'wf-tresult');

    expect(eventPush.pushEvent).toHaveBeenCalledWith(
      'wf-tresult',
      { type: 'tool_result', result: 'Tool output result' },
      serverUrl,
      headers,
    );
  });

  it('propagates errors from executor.invoke', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockRejectedValue(new Error('Chain failed')),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    await expect(worker({ prompt: 'test' }, 'wf-err')).rejects.toThrow('Chain failed');
  });

  it('handles empty prompt', async () => {
    const mockExecutor = {
      invoke: vi.fn().mockResolvedValue({ output: 'ok' }),
      lc_namespace: ['langchain'],
    };

    const worker = makeLangChainWorker(mockExecutor, 'test-worker', serverUrl, headers);
    const result = await worker({}, 'wf-empty');

    expect(mockExecutor.invoke).toHaveBeenCalledWith(
      { input: '' },
      expect.any(Object),
    );
    expect(result.status).toBe('COMPLETED');
  });
});
