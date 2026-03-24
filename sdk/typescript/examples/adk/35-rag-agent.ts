/**
 * Google ADK RAG Agent -- vector search + document indexing.
 *
 * Mirrors the pattern from google/adk-samples/RAG but uses Conductor's native
 * RAG system tasks (LLM_INDEX_TEXT, LLM_SEARCH_INDEX) instead of Vertex AI
 * RAG Engine.
 *
 * Demonstrates:
 *   - search_tool to query indexed documents
 *   - index_tool to populate a vector database with documents
 *   - End-to-end validation: index first, then search
 *
 * Requirements:
 *   - Conductor server with RAG system tasks enabled
 *   - A configured vector database (e.g., pgvector)
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=google_gemini/gemini-2.0-flash as environment variable
 */

import { AgentRuntime, searchTool, indexTool } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Knowledge base content to index ---------------------------------------

const DOCUMENTS = [
  {
    docId: 'auth-guide',
    text: 'API Authentication Guide. To authenticate API requests, include an ' +
      'Authorization header with a Bearer token. Tokens can be generated from ' +
      'the Settings > API Keys page. Tokens expire after 30 days.',
  },
  {
    docId: 'workflow-tasks',
    text: 'Workflow Task Types. Conductor supports: SIMPLE tasks executed by workers, ' +
      'HTTP tasks for REST API calls, INLINE tasks for JavaScript expressions, ' +
      'SUB_WORKFLOW for child workflows, FORK_JOIN_DYNAMIC for parallel tasks.',
  },
  {
    docId: 'error-handling',
    text: 'Error Handling and Retries. Set retryCount for retry attempts (default 3). ' +
      'retryLogic can be FIXED, EXPONENTIAL_BACKOFF, or LINEAR_BACKOFF. ' +
      'Tasks can be marked as optional: true so workflow continues on failure.',
  },
  {
    docId: 'agent-configuration',
    text: 'Agent Configuration. Agents are defined with name, model, instructions, ' +
      "and tools. The model field uses format 'provider/model_name'. " +
      'Tools can be @tool-decorated functions, http_tool, mcp_tool, or agent_tool.',
  },
  {
    docId: 'vector-search-setup',
    text: 'Vector Search Setup. Configure a vector database in application-rag.properties. ' +
      'Supported backends: pgvectordb, pineconedb, mongodb_atlas. ' +
      'Embedding dimensions default to 1536.',
  },
  {
    docId: 'multi-agent-patterns',
    text: 'Multi-Agent Patterns. SequentialAgent runs sub-agents in order. ' +
      'ParallelAgent runs concurrently. LoopAgent repeats up to max_iterations. ' +
      'Use handoff conditions for dynamic routing.',
  },
  {
    docId: 'webhook-events',
    text: 'Webhook and Event Configuration. Conductor supports webhook-based task ' +
      'completion via WAIT tasks. Event handlers support: complete_task, fail_task, ' +
      'or update_variables actions.',
  },
  {
    docId: 'guardrails',
    text: 'Guardrails. RegexGuardrail matches patterns in block or allow mode. ' +
      'LLMGuardrail uses a secondary LLM to evaluate outputs. ' +
      'Custom @guardrail functions implement arbitrary validation logic.',
  },
];

// -- RAG tools -------------------------------------------------------------

const kbSearch = searchTool({
  name: 'search_knowledge_base',
  description: 'Search the product documentation knowledge base.',
  vectorDb: 'pgvectordb',
  index: 'product_docs',
  embeddingModelProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  maxResults: 5,
});

const kbIndex = indexTool({
  name: 'index_document',
  description: 'Add a new document to the product documentation knowledge base.',
  vectorDb: 'pgvectordb',
  index: 'product_docs',
  embeddingModelProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
});

// -- Agent -----------------------------------------------------------------

const ragAgent = {
  run: async (prompt: string) => ({ output: `RAG: ${prompt}` }),
  model: llmModel, name: 'rag_assistant',
  instruction:
    'You are a product support assistant with access to the documentation ' +
    'knowledge base.\n\n' +
    'When the user asks you to index or store documents:\n' +
    '1. Use index_document for EACH document provided\n' +
    '2. Confirm each document was indexed\n\n' +
    'When the user asks a question:\n' +
    '1. ALWAYS search the knowledge base first using search_knowledge_base\n' +
    '2. If relevant documents are found, use them for an accurate answer\n' +
    '3. If no relevant documents are found, say so honestly\n\n' +
    'Always cite which documents (by docId) you used in your answer.',
  tools: [kbSearch, kbIndex],
  _google_adk: true,
};

// -- Runner ----------------------------------------------------------------

const runtime = new AgentRuntime();
try {
  // Phase 1: Index documents
  console.log('='.repeat(60));
  console.log('PHASE 1: Indexing documents into vector database');
  console.log('='.repeat(60));

  const indexLines = ['Please index the following documents into the knowledge base:\n'];
  for (const doc of DOCUMENTS) {
    indexLines.push(`DocID: ${doc.docId}`);
    indexLines.push(`Text: ${doc.text}\n`);
  }
  const indexPrompt = indexLines.join('\n');

  const indexResult = await runtime.run(ragAgent, indexPrompt);
  console.log(indexResult.output);

  // Phase 2: Search
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2: Searching the knowledge base');
  console.log('='.repeat(60));

  const queries = [
    'How do I authenticate my API requests? What are the rate limits?',
    'What retry policies are available for failed tasks?',
    'How do I set up vector search with PostgreSQL?',
    'What multi-agent patterns does the framework support?',
    'How do guardrails work and what happens when validation fails?',
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n--- Query ${i + 1}: ${queries[i]}`);
    const searchResult = await runtime.run(ragAgent, queries[i]);
    console.log(searchResult.output);
  }
} finally {
  await runtime.shutdown();
}
