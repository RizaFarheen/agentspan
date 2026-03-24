/**
 * Google ADK Hierarchical Agents -- multi-level agent delegation.
 *
 * Demonstrates:
 *   - Hierarchical multi-agent architecture
 *   - A top-level coordinator delegates to team leads
 *   - Team leads delegate to specialist agents with tools
 *   - Deep nesting of sub_agents
 *
 * Requirements:
 *   - Conductor server with Google Gemini LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Level 3: Specialist tools ---------------------------------------------

function checkApiHealth(service: string): Record<string, unknown> {
  const services: Record<string, Record<string, unknown>> = {
    auth: { status: 'healthy', latency_ms: 45, uptime: '99.99%' },
    payments: { status: 'degraded', latency_ms: 350, uptime: '99.5%' },
    users: { status: 'healthy', latency_ms: 28, uptime: '99.98%' },
  };
  return services[service.toLowerCase()] ?? { status: 'unknown', message: `Service '${service}' not found` };
}

function checkErrorLogs(service: string, hours: number = 1): Record<string, unknown> {
  const logs: Record<string, Record<string, unknown>> = {
    auth: { errors: 2, warnings: 5, top_error: 'Token validation timeout' },
    payments: { errors: 47, warnings: 120, top_error: 'Gateway timeout on /charge' },
    users: { errors: 0, warnings: 1, top_error: 'None' },
  };
  return { service, period_hours: hours, ...(logs[service.toLowerCase()] ?? { errors: -1 }) };
}

function runSecurityScan(target: string): Record<string, unknown> {
  return {
    target,
    vulnerabilities: { critical: 0, high: 1, medium: 3, low: 7 },
    top_finding: 'Outdated TLS 1.1 still enabled on /legacy endpoint',
    recommendation: 'Disable TLS 1.1, enforce TLS 1.3',
  };
}

function checkPerformanceMetrics(service: string): Record<string, unknown> {
  const metrics: Record<string, Record<string, number>> = {
    auth: { p50_ms: 22, p95_ms: 89, p99_ms: 145, rps: 1200 },
    payments: { p50_ms: 180, p95_ms: 450, p99_ms: 1200, rps: 300 },
    users: { p50_ms: 15, p95_ms: 45, p99_ms: 78, rps: 800 },
  };
  return { service, ...(metrics[service.toLowerCase()] ?? { error: 'No data' }) };
}

// -- Level 2: Specialist agents --------------------------------------------

const opsAgent = {
  run: async (prompt: string) => ({ output: `Ops: ${prompt}` }),
  model: llmModel,
  name: 'ops_specialist',
  description: 'Monitors service health and investigates operational issues.',
  instruction: 'Check service health and error logs. Identify issues and their severity.',
  tools: [
    { name: 'check_api_health', description: 'Check the health status of an API service.', fn: checkApiHealth, parameters: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] } },
    { name: 'check_error_logs', description: 'Check recent error logs for a service.', fn: checkErrorLogs, parameters: { type: 'object', properties: { service: { type: 'string' }, hours: { type: 'number' } }, required: ['service'] } },
  ],
  _google_adk: true,
};

const securityAgent = {
  run: async (prompt: string) => ({ output: `Security: ${prompt}` }),
  model: llmModel,
  name: 'security_specialist',
  description: 'Runs security scans and identifies vulnerabilities.',
  instruction: 'Run security scans and report findings with recommendations.',
  tools: [
    { name: 'run_security_scan', description: 'Run a security vulnerability scan.', fn: runSecurityScan, parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  ],
  _google_adk: true,
};

const performanceAgent = {
  run: async (prompt: string) => ({ output: `Perf: ${prompt}` }),
  model: llmModel,
  name: 'performance_specialist',
  description: 'Analyzes performance metrics and identifies bottlenecks.',
  instruction: 'Check performance metrics and identify latency issues.',
  tools: [
    { name: 'check_performance_metrics', description: 'Get performance metrics for a service.', fn: checkPerformanceMetrics, parameters: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] } },
  ],
  _google_adk: true,
};

// -- Level 1: Team leads ---------------------------------------------------

const reliabilityLead = {
  run: async (prompt: string) => ({ output: `Reliability: ${prompt}` }),
  model: llmModel,
  name: 'reliability_team_lead',
  description: 'Leads the reliability team covering ops and performance.',
  instruction:
    'You lead the reliability team. Coordinate the ops specialist ' +
    'and performance specialist to investigate service issues. ' +
    'Provide a consolidated reliability report.',
  sub_agents: [opsAgent, performanceAgent],
  _google_adk: true,
};

const securityLead = {
  run: async (prompt: string) => ({ output: `SecLead: ${prompt}` }),
  model: llmModel,
  name: 'security_team_lead',
  description: 'Leads the security team for vulnerability assessment.',
  instruction:
    'You lead the security team. Use the security specialist to ' +
    'assess vulnerabilities. Provide risk assessment and remediation priorities.',
  sub_agents: [securityAgent],
  _google_adk: true,
};

// -- Top level: Platform coordinator ---------------------------------------

const coordinator = {
  run: async (prompt: string) => ({ output: `Platform: ${prompt}` }),
  model: llmModel,
  name: 'platform_coordinator',
  instruction:
    "You are the platform engineering coordinator. When asked to assess " +
    "platform health:\n" +
    "1. Have the reliability team check service health and performance\n" +
    "2. Have the security team assess vulnerabilities\n" +
    "3. Compile a comprehensive platform status report\n\n" +
    "Prioritize critical issues and provide an executive summary.",
  sub_agents: [reliabilityLead, securityLead],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    'Give me a full platform health assessment. Focus on the payments service ' +
      'which seems to be having issues.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
