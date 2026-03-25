import { describe, it, expect } from 'vitest';
import { serializeLangGraph } from '../../../src/frameworks/langgraph-serializer.js';
import { ConfigurationError } from '../../../src/errors.js';

describe('serializeLangGraph', () => {
  describe('full extraction (createReactAgent-style)', () => {
    it('extracts model and tools from graph with ToolNode', () => {
      function searchWeb(query: string) { return `results for ${query}`; }
      function calculate(expr: string) { return eval(expr); }

      const mockGraph = {
        name: 'research_agent',
        invoke: () => {},
        getGraph: () => {},
        nodes: new Map<string, unknown>([
          ['__start__', {}],
          ['agent', {
            bound: {
              first: {
                model_name: 'gpt-4o',
                constructor: { name: 'ChatOpenAI' },
              },
            },
          }],
          ['tools', {
            bound: {
              tools_by_name: {
                search_web: {
                  name: 'search_web',
                  description: 'Search the web',
                  func: searchWeb,
                  params_json_schema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                  },
                },
                calculate: {
                  name: 'calculate',
                  description: 'Evaluate a math expression',
                  func: calculate,
                  params_json_schema: {
                    type: 'object',
                    properties: { expr: { type: 'string' } },
                  },
                },
              },
            },
          }],
          ['__end__', {}],
        ]),
      };

      const [config, workers] = serializeLangGraph(mockGraph);

      // Config should have model and tools
      expect(config.name).toBe('research_agent');
      expect(config.model).toBe('openai/gpt-4o');
      expect(Array.isArray(config.tools)).toBe(true);
      const tools = config.tools as Record<string, unknown>[];
      expect(tools).toHaveLength(2);
      expect(tools[0]._worker_ref).toBe('search_web');
      expect(tools[0].description).toBe('Search the web');
      expect(tools[1]._worker_ref).toBe('calculate');

      // Workers should contain the extracted tool functions
      expect(workers).toHaveLength(2);
      expect(workers[0].name).toBe('search_web');
      expect(workers[0].func).toBe(searchWeb);
      expect(workers[1].name).toBe('calculate');
      expect(workers[1].func).toBe(calculate);
    });

    it('extracts model with provider inference from class name', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['__start__', {}],
          ['agent', {
            bound: {
              first: {
                model_name: 'claude-3-sonnet',
                constructor: { name: 'ChatAnthropic' },
              },
            },
          }],
          ['tools', {
            bound: {
              tools_by_name: {
                my_tool: {
                  name: 'my_tool',
                  description: 'A tool',
                  func: () => {},
                  params_json_schema: { type: 'object', properties: {} },
                },
              },
            },
          }],
          ['__end__', {}],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      expect(config.model).toBe('anthropic/claude-3-sonnet');
    });

    it('uses model name as-is when it already includes provider', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', {
            bound: {
              model: 'google/gemini-2.0-flash',
            },
          }],
          ['tools', {
            bound: {
              tools_by_name: {
                t: { name: 't', description: 'd', func: () => {}, params_json_schema: { type: 'object' } },
              },
            },
          }],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      expect(config.model).toBe('google/gemini-2.0-flash');
    });
  });

  describe('graph-structure (custom StateGraph)', () => {
    it('extracts nodes and edges from a custom graph', () => {
      function planStep(state: any) { return state; }
      function executeStep(state: any) { return state; }

      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['__start__', {}],
          ['plan', {
            bound: { func: planStep },
          }],
          ['execute', {
            bound: { func: executeStep },
          }],
          ['__end__', {}],
        ]),
        builder: {
          edges: new Set([['__start__', 'plan'], ['plan', 'execute'], ['execute', '__end__']]),
        },
      };

      const [config, workers] = serializeLangGraph(mockGraph);

      // Should produce graph-structure config
      expect(config._graph).toBeDefined();
      const graph = config._graph as Record<string, unknown>;
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);

      const nodes = graph.nodes as Record<string, unknown>[];
      expect(nodes).toHaveLength(2);
      expect(nodes[0].name).toBe('plan');
      expect(nodes[1].name).toBe('execute');

      const edges = graph.edges as Record<string, string>[];
      expect(edges.length).toBeGreaterThanOrEqual(2);

      // Workers for each node
      expect(workers).toHaveLength(2);
      expect(workers[0].func).toBe(planStep);
      expect(workers[1].func).toBe(executeStep);
    });

    it('extracts conditional edges with router workers', () => {
      function processStep(state: any) { return state; }
      function routeDecision(state: any) { return 'approve'; }

      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['__start__', {}],
          ['process', {
            bound: { func: processStep },
          }],
          ['__end__', {}],
        ]),
        builder: {
          edges: new Set([['__start__', 'process']]),
          branches: {
            process: {
              default: {
                path: { func: routeDecision },
                ends: { approve: '__end__', reject: 'process' },
              },
            },
          },
        },
      };

      const [config, workers] = serializeLangGraph(mockGraph);

      const graph = config._graph as Record<string, unknown>;
      const conditionalEdges = graph.conditional_edges as Record<string, unknown>[];
      expect(conditionalEdges).toHaveLength(1);
      expect(conditionalEdges[0].source).toBe('process');
      expect(conditionalEdges[0]._router_ref).toContain('router');

      // Workers include the node + the router
      expect(workers).toHaveLength(2);
      const routerWorker = workers.find((w) => w.name.includes('router'));
      expect(routerWorker).toBeDefined();
      expect(routerWorker!.func).toBe(routeDecision);
    });
  });

  describe('model-only (no tools)', () => {
    it('produces config with model but no tools array', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', {
            bound: {
              first: {
                model_name: 'gpt-4o-mini',
                constructor: { name: 'ChatOpenAI' },
              },
            },
          }],
          ['__end__', {}],
        ]),
      };

      const [config, workers] = serializeLangGraph(mockGraph);
      expect(config.model).toBe('openai/gpt-4o-mini');
      expect(config.tools).toEqual([]);
      expect(workers).toHaveLength(0);
    });
  });

  describe('error cases', () => {
    it('throws ConfigurationError when no model or tools found', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['__start__', {}],
          ['__end__', {}],
        ]),
      };

      expect(() => serializeLangGraph(mockGraph)).toThrow(ConfigurationError);
    });

    it('throws ConfigurationError for empty graph', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>(),
      };

      expect(() => serializeLangGraph(mockGraph)).toThrow(ConfigurationError);
    });

    it('throws ConfigurationError when nodes is not a Map', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: { agent: {} },
      };

      expect(() => serializeLangGraph(mockGraph)).toThrow(ConfigurationError);
    });
  });

  describe('tool schema extraction', () => {
    it('extracts schema from params_json_schema', () => {
      const schema = { type: 'object', properties: { q: { type: 'string' } } };
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', { bound: { model: 'gpt-4o' } }],
          ['tools', {
            bound: {
              tools_by_name: {
                search: {
                  name: 'search',
                  description: 'Search',
                  func: () => {},
                  params_json_schema: schema,
                },
              },
            },
          }],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      const tools = config.tools as Record<string, unknown>[];
      expect(tools[0].parameters).toEqual(schema);
    });

    it('falls back to empty schema when no schema property exists', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', { bound: { model: 'gpt-4o' } }],
          ['tools', {
            bound: {
              tools_by_name: {
                bare_tool: {
                  name: 'bare_tool',
                  description: 'No schema',
                  func: () => {},
                },
              },
            },
          }],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      const tools = config.tools as Record<string, unknown>[];
      expect(tools[0].parameters).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('name derivation', () => {
    it('uses graph.name when available', () => {
      const mockGraph = {
        name: 'my_custom_graph',
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', { bound: { model: 'gpt-4o' } }],
          ['tools', {
            bound: {
              tools_by_name: {
                t: { name: 't', description: '', func: () => {}, params_json_schema: { type: 'object' } },
              },
            },
          }],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      expect(config.name).toBe('my_custom_graph');
    });

    it('defaults to langgraph_agent when no name', () => {
      const mockGraph = {
        invoke: () => {},
        nodes: new Map<string, unknown>([
          ['agent', { bound: { model: 'gpt-4o' } }],
          ['tools', {
            bound: {
              tools_by_name: {
                t: { name: 't', description: '', func: () => {}, params_json_schema: { type: 'object' } },
              },
            },
          }],
        ]),
      };

      const [config] = serializeLangGraph(mockGraph);
      expect(config.name).toBe('langgraph_agent');
    });
  });
});
