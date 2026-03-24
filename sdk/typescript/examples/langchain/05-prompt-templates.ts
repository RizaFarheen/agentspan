/**
 * Prompt Templates -- using ChatPromptTemplate for structured agent prompts.
 *
 * Demonstrates:
 *   - Building a ChatPromptTemplate with system + human messages
 *   - Using PromptTemplate for tool descriptions
 *   - Passing a custom system prompt to create_agent via state_modifier
 *   - Practical use case: persona-based agent with a specialized domain prompt
 *
 * In production you would use:
 *   import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock prompt template filling --

const SYSTEM_TEMPLATE = `You are {persona_name}, an expert {domain} consultant.
Your communication style is {style}.
Always structure your responses with:
1. A brief direct answer
2. Key supporting details
3. A practical next step

Current date context: 2025`;

function fillTemplate(personaName: string, domain: string, style: string): string {
  return SYSTEM_TEMPLATE
    .replace('{persona_name}', personaName)
    .replace('{domain}', domain)
    .replace('{style}', style);
}

const _filledSystem = fillTemplate('Dr. Data', 'data engineering', 'concise and technical');

// -- Mock tool implementations --

const explanations: Record<string, string> = {
  etl: 'Extract, Transform, Load -- a pipeline that pulls data from sources, transforms it, and loads into a target.',
  'data lake': 'A centralized repository storing raw data at any scale in its native format.',
  'data warehouse': 'A structured analytical database optimized for querying and reporting (e.g., BigQuery, Redshift).',
  streaming: 'Real-time data processing as events occur, using tools like Kafka, Flink, or Spark Streaming.',
  dbt: 'Data Build Tool -- SQL-based transformation framework for analytics engineering.',
  airflow: 'Apache Airflow -- workflow orchestration platform for scheduling and monitoring data pipelines.',
};

const recommendations: Record<string, string> = {
  'batch processing': 'Apache Spark or dbt for large-scale batch transformations.',
  'stream processing': 'Apache Kafka + Flink or AWS Kinesis for real-time streaming.',
  orchestration: 'Apache Airflow, Prefect, or Dagster for workflow scheduling.',
  storage: 'Snowflake or BigQuery for warehousing; S3 or GCS for data lake storage.',
  transformation: 'dbt (SQL) or Spark (Python) for data transformations.',
};

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const query = input.input.toLowerCase();
    const parts: string[] = [];

    // Simulate tool: recommend_tool
    for (const [key, value] of Object.entries(recommendations)) {
      if (query.includes(key) || key.split(' ').some((w) => query.includes(w))) {
        parts.push(`Tool recommendation: ${value}`);
        break;
      }
    }

    // Simulate tool: explain_concept
    for (const [key, value] of Object.entries(explanations)) {
      if (query.includes(key)) {
        parts.push(`Concept: ${value}`);
        break;
      }
    }

    const output = parts.length > 0
      ? parts.join('\n\n')
      : 'Please ask about data engineering concepts or tool recommendations.';

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running prompt template agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'What tool should I use for batch processing, and can you explain ETL?',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
