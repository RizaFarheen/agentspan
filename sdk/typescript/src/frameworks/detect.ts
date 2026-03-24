/**
 * Framework auto-detection via duck-typing.
 *
 * Detection order (priority):
 * 1. agent instanceof Agent → null (native agentspan)
 * 2. .generate() + .stream() + .tools → 'vercel_ai'
 * 3. .invoke() + (.getGraph() OR .nodes Map) → 'langgraph'
 * 4. .invoke() + .lc_namespace → 'langchain'
 * 5. .run() + OpenAI markers → 'openai'
 * 6. .run() + Google/ADK markers → 'google_adk'
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
 * Google ADK: has .run(), .model, and Google/ADK-specific markers.
 */
function hasRunAndADKMarkers(obj: any): boolean {
  if (typeof obj?.run !== 'function') return false;
  // Check for Google ADK markers: specific naming patterns, before_* hooks, etc.
  const hasModel = typeof obj?.model === 'string';
  const hasADKHint =
    typeof obj?.before_model_callback === 'function' ||
    typeof obj?.after_model_callback === 'function' ||
    typeof obj?.instruction === 'string' ||
    (hasModel && /^(gemini|models\/)/.test(obj.model));
  return hasADKHint;
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

  // 6. Google ADK: has .run() + .model with Google/ADK markers
  if (hasRunAndADKMarkers(agent)) return 'google_adk';

  // 7. Unknown — not a recognized framework
  return null;
}
