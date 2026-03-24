import { describe, it, expect } from 'vitest';
import { detectFramework } from '../../../src/frameworks/detect.js';
import { Agent } from '../../../src/agent.js';

// ── detectFramework ──────────────────────────────────────

describe('detectFramework', () => {
  describe('native Agent', () => {
    it('returns null for a native Agent instance', () => {
      const agent = new Agent({ name: 'test' });
      expect(detectFramework(agent)).toBeNull();
    });

    it('returns null for an Agent with tools and sub-agents', () => {
      const sub = new Agent({ name: 'sub' });
      const agent = new Agent({
        name: 'parent',
        agents: [sub],
        tools: [],
      });
      expect(detectFramework(agent)).toBeNull();
    });
  });

  describe('Vercel AI SDK detection', () => {
    it('detects object with generate(), stream(), and tools property', () => {
      const mockVercelAgent = {
        generate: () => {},
        stream: () => {},
        tools: { search: {} },
      };
      expect(detectFramework(mockVercelAgent)).toBe('vercel_ai');
    });

    it('detects when tools is an array', () => {
      const mockVercelAgent = {
        generate: () => {},
        stream: () => {},
        tools: [{ name: 'search' }],
      };
      expect(detectFramework(mockVercelAgent)).toBe('vercel_ai');
    });

    it('does not detect when tools is null', () => {
      const mock = {
        generate: () => {},
        stream: () => {},
        tools: null,
      };
      expect(detectFramework(mock)).not.toBe('vercel_ai');
    });

    it('does not detect when generate is missing', () => {
      const mock = {
        stream: () => {},
        tools: { search: {} },
      };
      expect(detectFramework(mock)).not.toBe('vercel_ai');
    });

    it('does not detect when stream is missing', () => {
      const mock = {
        generate: () => {},
        tools: { search: {} },
      };
      expect(detectFramework(mock)).not.toBe('vercel_ai');
    });
  });

  describe('LangGraph detection', () => {
    it('detects object with invoke() and getGraph()', () => {
      const mockGraph = {
        invoke: () => {},
        getGraph: () => {},
      };
      expect(detectFramework(mockGraph)).toBe('langgraph');
    });

    it('detects object with invoke() and nodes Map', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map([['node1', {}]]),
      };
      expect(detectFramework(mockGraph)).toBe('langgraph');
    });

    it('does not detect when invoke is missing', () => {
      const mock = {
        getGraph: () => {},
        nodes: new Map(),
      };
      expect(detectFramework(mock)).not.toBe('langgraph');
    });

    it('does not detect when neither getGraph nor nodes exist', () => {
      const mock = {
        invoke: () => {},
      };
      expect(detectFramework(mock)).not.toBe('langgraph');
    });

    it('does not detect when nodes is a plain object (not a Map)', () => {
      const mock = {
        invoke: () => {},
        nodes: { node1: {} },
      };
      // nodes must be a Map, not a plain object
      expect(detectFramework(mock)).not.toBe('langgraph');
    });
  });

  describe('LangChain detection', () => {
    it('detects object with invoke() and lc_namespace array', () => {
      const mockExecutor = {
        invoke: () => {},
        lc_namespace: ['langchain', 'agents'],
      };
      expect(detectFramework(mockExecutor)).toBe('langchain');
    });

    it('does not detect when lc_namespace is not an array', () => {
      const mock = {
        invoke: () => {},
        lc_namespace: 'langchain',
      };
      expect(detectFramework(mock)).not.toBe('langchain');
    });

    it('does not detect when invoke is missing', () => {
      const mock = {
        lc_namespace: ['langchain'],
      };
      expect(detectFramework(mock)).not.toBe('langchain');
    });
  });

  describe('OpenAI Agents SDK detection', () => {
    it('detects object with run(), tools, and model_settings', () => {
      const mockAgent = {
        run: () => {},
        tools: [{ name: 'search' }],
        model: 'gpt-4',
        model_settings: {},
      };
      expect(detectFramework(mockAgent)).toBe('openai');
    });

    it('detects object with run(), tools, and gpt model prefix', () => {
      const mockAgent = {
        run: () => {},
        tools: [{ name: 'search' }],
        model: 'gpt-4o',
      };
      expect(detectFramework(mockAgent)).toBe('openai');
    });

    it('detects object with run(), tools, model, and _oaiConfig', () => {
      const mockAgent = {
        run: () => {},
        tools: [{ name: 'search' }],
        model: 'gpt-4',
        _oaiConfig: {},
      };
      expect(detectFramework(mockAgent)).toBe('openai');
    });

    it('does not detect when run is missing', () => {
      const mock = {
        tools: [{ name: 'search' }],
        model: 'gpt-4',
        model_settings: {},
      };
      expect(detectFramework(mock)).not.toBe('openai');
    });
  });

  describe('Google ADK detection', () => {
    it('detects object with model and beforeModelCallback', () => {
      const mockAgent = {
        model: 'gemini-pro',
        beforeModelCallback: () => {},
      };
      expect(detectFramework(mockAgent)).toBe('google_adk');
    });

    it('detects object with model and afterModelCallback', () => {
      const mockAgent = {
        model: 'gemini-pro',
        afterModelCallback: () => {},
      };
      expect(detectFramework(mockAgent)).toBe('google_adk');
    });

    it('detects object with model and instruction string', () => {
      const mockAgent = {
        model: 'gemini-pro',
        instruction: 'You are a helpful assistant',
      };
      expect(detectFramework(mockAgent)).toBe('google_adk');
    });

    it('detects object with model and generateContentConfig', () => {
      const mockAgent = {
        model: 'gemini-2.0-flash',
        generateContentConfig: { temperature: 0.5 },
      };
      expect(detectFramework(mockAgent)).toBe('google_adk');
    });

    it('detects object with model and outputKey', () => {
      const mockAgent = {
        model: 'models/gemini-pro',
        outputKey: 'result',
      };
      expect(detectFramework(mockAgent)).toBe('google_adk');
    });

    it('does not detect when model is missing', () => {
      const mock = {
        instruction: 'You are helpful',
        beforeModelCallback: () => {},
      };
      expect(detectFramework(mock)).not.toBe('google_adk');
    });
  });

  describe('unknown objects', () => {
    it('returns null for null', () => {
      expect(detectFramework(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(detectFramework(undefined)).toBeNull();
    });

    it('returns null for a plain object', () => {
      expect(detectFramework({})).toBeNull();
    });

    it('returns null for a string', () => {
      expect(detectFramework('hello')).toBeNull();
    });

    it('returns null for a number', () => {
      expect(detectFramework(42)).toBeNull();
    });

    it('returns null for an object with unrelated methods', () => {
      const mock = {
        execute: () => {},
        configure: () => {},
      };
      expect(detectFramework(mock)).toBeNull();
    });
  });

  describe('priority ordering', () => {
    it('Vercel AI takes priority over LangGraph when both shapes match', () => {
      // An object that has generate/stream/tools AND invoke/getGraph
      const mock = {
        generate: () => {},
        stream: () => {},
        tools: { search: {} },
        invoke: () => {},
        getGraph: () => {},
      };
      expect(detectFramework(mock)).toBe('vercel_ai');
    });

    it('LangGraph takes priority over LangChain when both shapes match', () => {
      // An object that has invoke/getGraph AND lc_namespace
      const mock = {
        invoke: () => {},
        getGraph: () => {},
        lc_namespace: ['langchain'],
      };
      expect(detectFramework(mock)).toBe('langgraph');
    });

    it('LangChain takes priority over OpenAI when both shapes match', () => {
      // An object that has invoke/lc_namespace AND run/tools/model
      const mock = {
        invoke: () => {},
        lc_namespace: ['langchain'],
        run: () => {},
        tools: [],
        model: 'gpt-4',
        model_settings: {},
      };
      expect(detectFramework(mock)).toBe('langchain');
    });
  });
});
