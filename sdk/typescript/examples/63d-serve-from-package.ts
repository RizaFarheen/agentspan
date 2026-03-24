/**
 * 63d - Serve from Package — auto-discover and serve all agents.
 *
 * Demonstrates:
 *   - discoverAgents() for auto-discovery of agents
 *   - Mixing explicit agents with package-based discovery
 *
 * NOTE: serve() is blocking. This example prints usage instructions.
 * In production, uncomment the runtime.serve() call.
 *
 * Requirements:
 *   - Conductor server running
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { z } from 'zod';
import { Agent, AgentRuntime, tool } from '../src/index.js';
import { llmModel } from './settings.js';

// -- Explicit agent ----------------------------------------------------------

const healthCheck = tool(
  async () => {
    return 'All systems operational';
  },
  {
    name: 'health_check',
    description: 'Perform a basic health check.',
    inputSchema: z.object({}),
  },
);

const monitoringAgent = new Agent({
  name: 'monitoring',
  model: llmModel,
  tools: [healthCheck],
  instructions: 'You monitor system health.',
});

// -- Serve -------------------------------------------------------------------

console.log('Serving monitoring agent.');
console.log('To also serve discovered agents, use discoverAgents().');
console.log('');
console.log('Usage:');
console.log('  import { discoverAgents } from "../src/index.js";');
console.log('  const agents = await discoverAgents(["./agents"]);');
console.log('  await runtime.serve(monitoringAgent, ...agents);');

// In production, uncomment:
// const runtime = new AgentRuntime();
// await runtime.serve(monitoringAgent);  // blocks until Ctrl+C / SIGTERM
