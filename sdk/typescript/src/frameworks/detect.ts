/**
 * Framework auto-detection via duck-typing.
 *
 * Detection order (priority):
 * 1. agent instanceof Agent → null (native agentspan)
 * 2. .generate() + .stream() + .tools → 'vercel_ai'
 * 3. .invoke() + (.getGraph() OR .nodes Map) → 'langgraph'
 * 4. .invoke() + .lc_namespace → 'langchain'
 * 5. .run() + OpenAI markers → 'openai'
 * 6. .model + .instruction + ADK-specific props → 'google_adk'
 * 7. Otherwise → null
 *
 * All detection uses duck-typing — no imports of framework packages.
 */

import { Agent } from '../agent.js';
import type { FrameworkId } from '../types.js';

// ── Private detection helpers ───────────────────────────

/**
 * Vercel AI SDK: ToolLoopAgent has .generate(), .stream(), and .tools property.
 */
function hasGenerateAndStreamAndTools(obj: any): boolean {
  return (
    typeof obj?.generate === 'function' &&
    typeof obj?.stream === 'function' &&
    obj?.tools != null
  );
}

/**
 * LangGraph.js: CompiledStateGraph has .invoke() and either .getGraph() or .nodes (Map).
 */
function hasInvokeAndGetGraph(obj: any): boolean {
  return (
    typeof obj?.invoke === 'function' &&
    (typeof obj?.getGraph === 'function' || obj?.nodes instanceof Map)
  );
}

/**
 * LangChain.js: AgentExecutor/Runnable has .invoke() and .lc_namespace.
 */
function hasInvokeAndLcNamespace(obj: any): boolean {
  return (
    typeof obj?.invoke === 'function' &&
    Array.isArray(obj?.lc_namespace)
  );
}

/**
 * OpenAI Agents SDK: has .run(), .tools, and .model with OpenAI-related markers.
 */
function hasRunAndOpenAIMarkers(obj: any): boolean {
  if (typeof obj?.run !== 'function') return false;
  // Check for OpenAI-specific markers: model field with openai-ish pattern,
  // or constructor name referencing OpenAI/Agent, or _oai* internal fields
  const hasTools = obj?.tools != null;
  const hasModel = typeof obj?.model === 'string';
  const hasOpenAIHint =
    obj?.constructor?.name === 'Agent' ||
    typeof obj?._oaiConfig === 'object' ||
    typeof obj?.model_settings === 'object' ||
    (hasModel && /^(gpt|o1|o3)/.test(obj.model));
  return hasTools && hasOpenAIHint;
}

/**
 * Google ADK: LlmAgent has .model, .instruction, and ADK-specific properties
 * like .generateContentConfig, .outputKey, .subAgents, .beforeModelCallback.
 *
 * Note: The TS ADK LlmAgent does NOT have a .run() method (unlike Python's Agent).
 * Execution uses InMemoryRunner + InMemorySessionService.
 */
function hasADKMarkers(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const hasModel = typeof obj.model === 'string';
  const hasInstruction =
    typeof obj.instruction === 'string' || typeof obj.instruction === 'function';
  // ADK-specific properties that distinguish it from other frameworks
  const hasADKProps =
    'generateContentConfig' in obj ||
    'outputKey' in obj ||
    'beforeModelCallback' in obj ||
    'afterModelCallback' in obj ||
    'disallowTransferToParent' in obj ||
    'includeContents' in obj;
  return hasModel && (hasInstruction || hasADKProps);
}

// ── Public API ──────────────────────────────────────────

/**
 * Detect which framework (if any) the given agent object belongs to.
 * Returns null for native agentspan Agent instances or unknown objects.
 */
export function detectFramework(agent: unknown): FrameworkId | null {
  // 1. Native agentspan Agent — not a framework
  if (agent instanceof Agent) return null;

  // 2. Vercel AI SDK: ToolLoopAgent has .generate() + .stream() + .tools
  if (hasGenerateAndStreamAndTools(agent)) return 'vercel_ai';

  // 3. LangGraph.js: CompiledStateGraph has .invoke() + .getGraph() or .nodes
  if (hasInvokeAndGetGraph(agent)) return 'langgraph';

  // 4. LangChain.js: AgentExecutor/Runnable has .invoke() + .lc_namespace
  if (hasInvokeAndLcNamespace(agent)) return 'langchain';

  // 5. OpenAI Agents: has .run() + .tools + .model with OpenAI markers
  if (hasRunAndOpenAIMarkers(agent)) return 'openai';

  // 6. Google ADK: LlmAgent with .model + .instruction + ADK-specific properties
  if (hasADKMarkers(agent)) return 'google_adk';

  // 7. Unknown — not a recognized framework
  return null;
}
