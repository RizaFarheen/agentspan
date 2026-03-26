import type {
  Strategy,
  CredentialFile,
  CodeExecutionConfig,
  CliConfig,
  PromptTemplate as PromptTemplateInterface,
} from './types.js';
import { agentTool } from './tool.js';

// ── PromptTemplate class ──────────────────────────────────

/**
 * Named prompt template with optional variable substitution.
 * References a server-managed prompt template.
 */
export class PromptTemplate {
  readonly name: string;
  readonly variables?: Record<string, string>;
  readonly version?: number;

  constructor(
    name: string,
    variables?: Record<string, string>,
    version?: number,
  ) {
    this.name = name;
    this.variables = variables;
    this.version = version;
  }
}

// ── AgentOptions ──────────────────────────────────────────

/**
 * Termination condition interface.
 * Implementations like TextMention, StopMessage, MaxMessage, TokenUsage
 * will be in termination.ts. For now we accept any object with toJSON().
 */
export interface TerminationCondition {
  toJSON(): object;
}

/**
 * Handoff condition interface.
 * Implementations will be in handoff.ts.
 */
export interface HandoffCondition {
  toJSON(): object;
}

/**
 * Gate condition interface.
 */
export interface GateCondition {
  toJSON?(): object;
  type?: string;
  text?: string;
  caseSensitive?: boolean;
  fn?: Function;
}

/**
 * Callback handler interface.
 */
export interface CallbackHandler {
  onAgentStart?(agentName: string, prompt: string): Promise<void>;
  onAgentEnd?(agentName: string, result: unknown): Promise<void>;
  onModelStart?(agentName: string, messages: unknown[]): Promise<void>;
  onModelEnd?(agentName: string, response: unknown): Promise<void>;
  onToolStart?(
    agentName: string,
    toolName: string,
    args: unknown,
  ): Promise<void>;
  onToolEnd?(
    agentName: string,
    toolName: string,
    result: unknown,
  ): Promise<void>;
}

/**
 * Memory interface for conversation history.
 */
export interface ConversationMemory {
  toChatMessages(): unknown[];
  maxMessages?: number;
}

/**
 * Options for constructing an Agent.
 */
export interface AgentOptions {
  name: string;
  model?: string;
  instructions?: string | PromptTemplate | ((...args: unknown[]) => string);
  tools?: unknown[]; // Normalized via normalizeToolInput at serialization
  agents?: Agent[];
  strategy?: Strategy;
  router?: Agent | ((...args: unknown[]) => string);
  outputType?: unknown; // ZodSchema or JSON Schema object
  guardrails?: unknown[];
  memory?: ConversationMemory;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  timeoutSeconds?: number;
  external?: boolean;
  stopWhen?: (messages: unknown[], ...args: unknown[]) => boolean;
  termination?: TerminationCondition;
  handoffs?: HandoffCondition[];
  allowedTransitions?: Record<string, string[]>;
  introduction?: string;
  metadata?: Record<string, unknown>;
  callbacks?: CallbackHandler[];
  planner?: boolean;
  includeContents?: 'default' | 'none';
  thinkingBudgetTokens?: number;
  requiredTools?: string[];
  gate?: GateCondition;
  codeExecutionConfig?: CodeExecutionConfig;
  cliConfig?: CliConfig;
  credentials?: (string | CredentialFile)[];
}

// ── Agent class ───────────────────────────────────────────

/**
 * The single orchestration primitive.
 * Every agent — simple or complex — is an instance of this class.
 */
export class Agent {
  readonly name: string;
  readonly model?: string;
  readonly instructions?:
    | string
    | PromptTemplate
    | ((...args: unknown[]) => string);
  readonly tools: unknown[];
  readonly agents: Agent[];
  readonly strategy?: Strategy;
  readonly router?: Agent | ((...args: unknown[]) => string);
  readonly outputType?: unknown;
  readonly guardrails: unknown[];
  readonly memory?: ConversationMemory;
  readonly maxTurns: number;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutSeconds: number;
  readonly external: boolean;
  readonly stopWhen?: (messages: unknown[], ...args: unknown[]) => boolean;
  readonly termination?: TerminationCondition;
  readonly handoffs: HandoffCondition[];
  readonly allowedTransitions?: Record<string, string[]>;
  readonly introduction?: string;
  readonly metadata?: Record<string, unknown>;
  readonly callbacks: CallbackHandler[];
  readonly planner: boolean;
  readonly includeContents?: 'default' | 'none';
  readonly thinkingBudgetTokens?: number;
  readonly requiredTools?: string[];
  readonly gate?: GateCondition;
  readonly codeExecutionConfig?: CodeExecutionConfig;
  readonly cliConfig?: CliConfig;
  readonly credentials?: (string | CredentialFile)[];

  constructor(options: AgentOptions) {
    this.name = options.name;
    this.model = options.model;
    this.instructions = options.instructions;
    this.tools = options.tools ?? [];
    this.agents = options.agents ?? [];
    this.strategy = options.strategy;
    this.router = options.router;
    this.outputType = options.outputType;
    this.guardrails = options.guardrails ?? [];
    this.memory = options.memory;
    this.maxTurns = options.maxTurns ?? 25;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.timeoutSeconds = options.timeoutSeconds ?? 0;
    this.external = options.external ?? false;
    this.stopWhen = options.stopWhen;
    this.termination = options.termination;
    this.handoffs = options.handoffs ?? [];
    this.allowedTransitions = options.allowedTransitions;
    this.introduction = options.introduction;
    this.metadata = options.metadata;
    this.callbacks = options.callbacks ?? [];
    this.planner = options.planner ?? false;
    this.includeContents = options.includeContents;
    this.thinkingBudgetTokens = options.thinkingBudgetTokens;
    this.requiredTools = options.requiredTools;
    this.gate = options.gate;
    this.codeExecutionConfig = options.codeExecutionConfig;
    this.cliConfig = options.cliConfig;
    this.credentials = options.credentials;
  }

  /**
   * Create a sequential pipeline: `a.pipe(b)`.
   *
   * FLATTENING RULE (base spec §14.14):
   * If `this` already has `strategy === 'sequential'`, merge agents arrays.
   * `a.pipe(b).pipe(c)` → Agent with agents: [a, b, c], NOT nested.
   */
  pipe(other: Agent): Agent {
    if (this.strategy === 'sequential' && this.agents.length > 0) {
      // Flatten: merge other into existing sequential pipeline
      return new Agent({
        name: [...this.agents, other].map((a) => a.name).join('_'),
        agents: [...this.agents, other],
        strategy: 'sequential',
      });
    }

    // Create new sequential pipeline
    return new Agent({
      name: `${this.name}_${other.name}`,
      agents: [this, other],
      strategy: 'sequential',
    });
  }
}

// ── scatterGather ─────────────────────────────────────────

export interface ScatterGatherOptions {
  name: string;
  model?: string;
  instructions?: string;
  /** The worker agent that handles each sub-task. */
  workers: Agent[];
  /** Extra tools for the coordinator (in addition to the worker tools). */
  tools?: unknown[];
  /** Retries per sub-task on failure (default 2). */
  retryCount?: number;
  /** Base delay between retries in seconds (default 2). */
  retryDelaySeconds?: number;
  /** When true, a single sub-task failure fails the entire scatter-gather. Default false. */
  failFast?: boolean;
  /** Timeout in seconds for the entire coordinator (default 300). */
  timeoutSeconds?: number;
  /** @deprecated Use `instructions` instead. */
  coordinatorInstructions?: string;
}

const SCATTER_GATHER_PREFIX = (workerNames: string) =>
  `You are a coordinator that decomposes problems into independent sub-tasks.

WORKFLOW:
1. Analyze the input and identify independent sub-problems
2. Call the worker tool(s) MULTIPLE TIMES IN PARALLEL — once per sub-problem, each with a clear, self-contained prompt
3. After all results return, synthesize them into a unified answer

Available worker tools: ${workerNames}

IMPORTANT: Issue all tool calls in a SINGLE response to maximize parallelism.
`;

/**
 * Create a coordinator agent pre-configured for the scatter-gather pattern.
 *
 * The coordinator decomposes a problem into N independent sub-tasks,
 * dispatches the worker agent(s) N times in parallel (via `agentTool`),
 * and synthesizes the results. N is determined at runtime by the LLM.
 *
 * Each sub-task is a durable Conductor sub-workflow with automatic retries.
 */
export function scatterGather(options: ScatterGatherOptions): Agent {
  const workerTools = options.workers.map((worker) =>
    agentTool(worker, {
      retryCount: options.retryCount,
      retryDelaySeconds: options.retryDelaySeconds,
      optional: options.failFast === true ? false : true,
    }),
  );

  const resolvedModel = options.model ?? options.workers[0]?.model ?? 'openai/gpt-4o';
  const workerNames = options.workers.map((w) => w.name).join(', ');
  const prefix = SCATTER_GATHER_PREFIX(workerNames);
  const userInstructions = options.instructions ?? options.coordinatorInstructions ?? '';
  const fullInstructions = userInstructions ? `${prefix}\n${userInstructions}` : prefix;

  const allTools = [...workerTools, ...(options.tools ?? [])];

  return new Agent({
    name: options.name,
    model: resolvedModel,
    instructions: fullInstructions,
    tools: allTools,
    timeoutSeconds: options.timeoutSeconds ?? 300,
  });
}

// ── @AgentDec decorator ───────────────────────────────────

const AGENT_DECORATOR_KEY = Symbol('AGENT_DECORATOR');

/**
 * Class method decorator that marks a method as an agent definition.
 * Use `agentsFrom(instance)` to extract decorated methods as Agent instances.
 */
export function AgentDec(options: Omit<AgentOptions, 'instructions'> & { instructions?: string }) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): void {
    if (!descriptor.value) return;

    Object.defineProperty(descriptor.value, AGENT_DECORATOR_KEY, {
      value: { ...options, _methodName: propertyKey },
      writable: false,
      enumerable: false,
      configurable: false,
    });
  };
}

/**
 * Extract all @AgentDec-decorated methods from a class instance as Agent instances.
 */
export function agentsFrom(instance: object): Agent[] {
  const agents: Agent[] = [];
  const proto = Object.getPrototypeOf(instance);
  const propertyNames = Object.getOwnPropertyNames(proto);

  for (const key of propertyNames) {
    if (key === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor?.value || typeof descriptor.value !== 'function') continue;

    const metadata = (descriptor.value as Record<symbol, unknown>)[
      AGENT_DECORATOR_KEY
    ] as (AgentOptions & { _methodName: string }) | undefined;

    if (!metadata) continue;

    agents.push(
      new Agent({
        name: metadata.name ?? metadata._methodName,
        model: metadata.model,
        instructions: metadata.instructions as string | undefined,
        tools: metadata.tools,
        agents: metadata.agents,
        strategy: metadata.strategy,
        maxTurns: metadata.maxTurns,
        maxTokens: metadata.maxTokens,
        temperature: metadata.temperature,
        timeoutSeconds: metadata.timeoutSeconds,
        external: metadata.external,
        metadata: metadata.metadata,
        planner: metadata.planner,
        credentials: metadata.credentials,
      }),
    );
  }

  return agents;
}

// ── agent() functional wrapper ────────────────────────────

/**
 * Functional alternative to `new Agent()`.
 * Creates an Agent from a function (which becomes the instructions callable)
 * and additional options.
 */
export function agent(
  fn: (...args: unknown[]) => string,
  options: Omit<AgentOptions, 'instructions'> & { name: string },
): Agent {
  return new Agent({
    ...options,
    instructions: fn,
  });
}
