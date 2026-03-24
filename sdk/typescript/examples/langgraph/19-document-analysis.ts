/**
 * Document Analysis Agent -- create_react_agent with document processing tools.
 *
 * Demonstrates:
 *   - A suite of document analysis tools: read, extract entities, summarize, classify sentiment
 *   - Realistic mock implementations returning structured data
 *   - Chaining multiple tools to produce a comprehensive document report
 *
 * In production you would use:
 *   import { createReactAgent } from '@langchain/langgraph/prebuilt';
 *   import { tool } from '@langchain/core/tools';
 */

import { AgentRuntime } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Mock document store
// ---------------------------------------------------------------------------
const DOCUMENTS: Record<string, string> = {
  quarterly_report:
    'Q3 2024 Performance Report: Our revenue grew 23% year-over-year to $4.2 billion. ' +
    'CEO Jane Smith announced the acquisition of TechCorp Ltd for $800 million. ' +
    'Product launches in APAC markets exceeded expectations. ' +
    'CFO John Doe highlighted cost-cutting measures saving $120 million annually. ' +
    'Headcount increased by 1,200 employees across North America and Europe.',
  product_review:
    'This smartphone is absolutely fantastic! The camera quality is stunning and the battery ' +
    'lasts two full days. However, the price point is too high for most consumers. ' +
    'Customer service was responsive when I had questions about setup. ' +
    'Overall, a premium device that delivers on its promises, though not for budget shoppers.',
  incident_report:
    'On March 15, 2024, a service outage occurred affecting systems in region US-EAST-1. ' +
    'Root cause: database connection pool exhaustion due to an unoptimized query in v2.3.1. ' +
    'Engineering lead Sarah Chen resolved the issue within 90 minutes. ' +
    'Impact: 3,400 users affected, $45,000 estimated revenue loss. ' +
    'Mitigation: query optimization deployed, connection limits increased.',
};

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function readDocument(documentId: string): string {
  const content = DOCUMENTS[documentId.toLowerCase().replace(/ /g, '_')];
  if (!content) {
    return `Document '${documentId}' not found. Available: ${Object.keys(DOCUMENTS).join(', ')}`;
  }
  return content;
}

function extractEntities(text: string): string {
  const entities: Record<string, string[]> = {
    people: [],
    organizations: [],
    monetary: [],
    dates: [],
  };

  if (text.includes('Jane Smith')) entities.people.push('Jane Smith (CEO)');
  if (text.includes('John Doe')) entities.people.push('John Doe (CFO)');
  if (text.includes('Sarah Chen')) entities.people.push('Sarah Chen (Engineering Lead)');
  if (text.includes('TechCorp')) entities.organizations.push('TechCorp Ltd');

  // Extract monetary values
  const moneyMatches = text.match(/\$[\d,.]+ (?:billion|million|thousand)?/g);
  if (moneyMatches) entities.monetary = moneyMatches.slice(0, 5);

  // Extract dates
  const dateMatches = text.match(/\b(?:Q[1-4] \d{4}|\w+ \d{1,2},? \d{4})\b/g);
  if (dateMatches) entities.dates = dateMatches.slice(0, 5);

  const lines: string[] = [];
  for (const [category, items] of Object.entries(entities)) {
    if (items.length > 0) {
      lines.push(`${category.charAt(0).toUpperCase() + category.slice(1)}: ${items.join(', ')}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'No named entities detected.';
}

function summarizeDocument(text: string, maxWords = 50): string {
  const sentences = text
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const selected = sentences.slice(0, 2);
  let summary = selected.join('. ') + '.';
  const words = summary.split(/\s+/);
  if (words.length > maxWords) {
    summary = words.slice(0, maxWords).join(' ') + '...';
  }
  return summary;
}

function classifySentiment(text: string): string {
  const textLower = text.toLowerCase();
  const positiveWords = ['grew', 'exceeded', 'fantastic', 'stunning', 'resolved', 'success'];
  const negativeWords = ['outage', 'loss', 'affected', 'high price', 'exhaustion'];

  const posCount = positiveWords.filter((w) => textLower.includes(w)).length;
  const negCount = negativeWords.filter((w) => textLower.includes(w)).length;

  let sentiment: string;
  let confidence: string;

  if (posCount > negCount * 2) {
    sentiment = 'POSITIVE';
    confidence = 'high';
  } else if (negCount > posCount) {
    sentiment = 'NEGATIVE';
    confidence = 'medium';
  } else if (posCount > 0 && negCount > 0) {
    sentiment = 'MIXED';
    confidence = 'medium';
  } else {
    sentiment = 'NEUTRAL';
    confidence = 'low';
  }

  return (
    `Sentiment: ${sentiment}\n` +
    `Confidence: ${confidence}\n` +
    `Positive signals: ${posCount}, Negative signals: ${negCount}`
  );
}

// ---------------------------------------------------------------------------
// Mock compiled graph
// ---------------------------------------------------------------------------
const graph = {
  name: 'document_analysis_agent',

  builder: { channels: { messages: true } },

  invoke: async (input: Record<string, unknown>) => {
    const docContent = readDocument('quarterly_report');
    const entities = extractEntities(docContent);
    const summary = summarizeDocument(docContent);
    const sentiment = classifySentiment(docContent);

    return {
      messages: [
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'read_document', args: { document_id: 'quarterly_report' } },
          ],
        },
        { role: 'tool', name: 'read_document', content: docContent },
        {
          role: 'ai',
          content: null,
          tool_calls: [
            { name: 'extract_entities', args: { text: docContent } },
            { name: 'summarize_document', args: { text: docContent, max_words: 50 } },
            { name: 'classify_sentiment', args: { text: docContent } },
          ],
        },
        { role: 'tool', name: 'extract_entities', content: entities },
        { role: 'tool', name: 'summarize_document', content: summary },
        { role: 'tool', name: 'classify_sentiment', content: sentiment },
        {
          role: 'assistant',
          content:
            `Document Analysis Report: quarterly_report\n` +
            `=========================================\n\n` +
            `Entities:\n${entities}\n\n` +
            `Summary:\n${summary}\n\n` +
            `Sentiment:\n${sentiment}`,
        },
      ],
    };
  },

  getGraph: () => ({
    nodes: new Map([
      ['__start__', {}],
      ['agent', {}],
      ['tools', {}],
      ['__end__', {}],
    ]),
    edges: [
      ['__start__', 'agent'],
      ['agent', 'tools'],
      ['tools', 'agent'],
      ['agent', '__end__'],
    ],
  }),

  nodes: new Map([
    ['agent', {}],
    ['tools', {}],
  ]),

  stream: async function* (input: Record<string, unknown>) {
    const state = await graph.invoke(input);
    yield ['updates', { agent: { messages: [state.messages[0]] } }];
    yield ['updates', { tools: { messages: [state.messages[1]] } }];
    yield ['updates', { agent: { messages: [state.messages[2]] } }];
    yield ['updates', { tools: { messages: state.messages.slice(3, 6) } }];
    yield ['updates', { agent: { messages: [state.messages[6]] } }];
    yield ['values', state];
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      graph,
      "Please provide a full analysis of the 'quarterly_report' document.",
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

main().catch(console.error);
