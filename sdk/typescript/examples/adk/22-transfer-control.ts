/**
 * Google ADK Transfer Control -- restricted agent handoffs.
 *
 * Demonstrates:
 *   - disallow_transfer_to_parent: prevents sub-agent from returning to parent
 *   - disallow_transfer_to_peers: prevents sub-agent from transferring to siblings
 *   - These map to allowedTransitions in the Conductor workflow
 *
 * Requirements:
 *   - Conductor server with transfer control support
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

const specialistA = {
  run: async (prompt: string) => ({ output: `DataCollect: ${prompt}` }),
  model: llmModel, name: 'data_collector',
  instruction:
    'You are a data collection specialist. Gather relevant data points ' +
    'about the topic and pass them to the analyst for analysis. ' +
    'You should NOT return to the coordinator directly.',
  disallow_transfer_to_parent: true,
  _google_adk: true,
};

const specialistB = {
  run: async (prompt: string) => ({ output: `Analyst: ${prompt}` }),
  model: llmModel, name: 'analyst',
  instruction:
    'You are a data analyst. Take the data collected and provide ' +
    'a concise analysis with insights. You can transfer to any agent.',
  _google_adk: true,
};

const specialistC = {
  run: async (prompt: string) => ({ output: `Summary: ${prompt}` }),
  model: llmModel, name: 'summarizer',
  instruction:
    'You are a summarizer. Take the analysis and create a brief ' +
    'executive summary. Return the summary to the coordinator. ' +
    'Do NOT transfer to other specialists.',
  disallow_transfer_to_peers: true,
  _google_adk: true,
};

const coordinator = {
  run: async (prompt: string) => ({ output: `Coord: ${prompt}` }),
  model: llmModel, name: 'research_coordinator',
  instruction:
    "You are a research coordinator managing a team of specialists:\n" +
    "- data_collector: gathers raw data (cannot return to you directly)\n" +
    "- analyst: analyzes data (can transfer freely)\n" +
    "- summarizer: creates executive summaries (cannot transfer to peers)\n\n" +
    "Route the user's request through the appropriate workflow.",
  sub_agents: [specialistA, specialistB, specialistC],
  _google_adk: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    coordinator,
    'Research the current state of renewable energy adoption worldwide.',
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
