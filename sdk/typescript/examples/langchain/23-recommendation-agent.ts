/**
 * Recommendation Agent -- personalized recommendations based on user preferences.
 *
 * Demonstrates:
 *   - User profile-aware recommendation engine
 *   - Filtering and ranking candidate items by preference match
 *   - Explanation-driven recommendations with reasoning
 *   - Practical use case: personalized product or content recommendation
 *
 * Requires: OPENAI_API_KEY environment variable
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AgentRuntime } from '../../src/index.js';

// ── Mock catalog ─────────────────────────────────────────

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  level: string;
  rating: number;
}

interface Course {
  id: string;
  title: string;
  provider: string;
  level: string;
  hours: number;
}

const BOOKS: Book[] = [
  { id: 'b1', title: 'Clean Code', author: 'Robert C. Martin', genre: 'programming', level: 'intermediate', rating: 4.7 },
  { id: 'b2', title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', genre: 'programming', level: 'intermediate', rating: 4.8 },
  { id: 'b3', title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', genre: 'data engineering', level: 'advanced', rating: 4.9 },
  { id: 'b4', title: 'Python Crash Course', author: 'Eric Matthes', genre: 'programming', level: 'beginner', rating: 4.6 },
  { id: 'b5', title: 'The Algorithm Design Manual', author: 'Steven Skiena', genre: 'algorithms', level: 'advanced', rating: 4.5 },
  { id: 'b6', title: 'Atomic Habits', author: 'James Clear', genre: 'productivity', level: 'all', rating: 4.8 },
  { id: 'b7', title: 'Deep Learning', author: 'Goodfellow et al.', genre: 'machine learning', level: 'advanced', rating: 4.7 },
  { id: 'b8', title: 'Hands-On Machine Learning', author: 'Aurelien Geron', genre: 'machine learning', level: 'intermediate', rating: 4.8 },
];

const COURSES: Course[] = [
  { id: 'c1', title: 'LangChain for LLM Applications', provider: 'DeepLearning.AI', level: 'intermediate', hours: 4 },
  { id: 'c2', title: 'Machine Learning Specialization', provider: 'Coursera', level: 'beginner', hours: 90 },
  { id: 'c3', title: 'Advanced Python Programming', provider: 'Udemy', level: 'intermediate', hours: 20 },
  { id: 'c4', title: 'System Design Interview', provider: 'Educative', level: 'advanced', hours: 15 },
  { id: 'c5', title: 'Data Engineering with Python', provider: 'DataCamp', level: 'intermediate', hours: 30 },
];

// ── Tool definitions ─────────────────────────────────────

const getBookRecommendations = new DynamicStructuredTool({
  name: 'get_book_recommendations',
  description: 'Get personalized book recommendations based on interests and skill level.',
  schema: z.object({
    interests: z.string().describe("Comma-separated list of interests (e.g., 'programming, machine learning')"),
    skill_level: z.string().optional().default('intermediate').describe("Reader's level -- 'beginner', 'intermediate', 'advanced'"),
    max_results: z.number().optional().default(3).describe('Number of books to recommend (1-5)'),
  }),
  func: async ({ interests, skill_level, max_results }) => {
    const interestList = interests.split(',').map((i) => i.trim().toLowerCase());
    const candidates: [number, Book][] = [];

    for (const book of BOOKS) {
      const genreMatch = interestList.some((i) => book.genre.includes(i) || i.includes(book.genre));
      const levelMatch = book.level === skill_level || book.level === 'all';
      if (genreMatch || levelMatch) {
        const score = (genreMatch ? 1 : 0) + (levelMatch ? 1 : 0) + book.rating / 5;
        candidates.push([score, book]);
      }
    }

    candidates.sort((a, b) => b[0] - a[0]);
    const top = candidates.slice(0, max_results);

    if (top.length === 0) return 'No matching books found. Try broader interests.';

    const lines = [`Top ${top.length} book recommendations:`];
    for (const [, book] of top) {
      lines.push(
        `  * '${book.title}' by ${book.author} ` +
          `[${book.genre}, ${book.level}, rating ${book.rating}]`
      );
    }
    return lines.join('\n');
  },
});

const getCourseRecommendations = new DynamicStructuredTool({
  name: 'get_course_recommendations',
  description: 'Get online course recommendations based on a learning goal and time budget.',
  schema: z.object({
    learning_goal: z.string().describe("What you want to learn (e.g., 'build LLM apps', 'machine learning')"),
    available_hours: z.number().optional().default(20).describe('Total hours available to dedicate (1-100)'),
  }),
  func: async ({ learning_goal, available_hours }) => {
    const goalLower = learning_goal.toLowerCase();
    const candidates: [number, Course][] = [];

    for (const course of COURSES) {
      const titleMatch = goalLower.split(/\s+/).some((w) => course.title.toLowerCase().includes(w));
      const timeMatch = course.hours <= available_hours * 1.2;
      if (titleMatch || timeMatch) {
        const fitScore = (titleMatch ? 1 : 0) + (timeMatch ? 1 : 0);
        candidates.push([fitScore, course]);
      }
    }

    candidates.sort((a, b) => b[0] - a[0] || a[1].hours - b[1].hours);
    const top = candidates.slice(0, 3);

    if (top.length === 0) return 'No matching courses found.';

    const lines = [`Course recommendations for '${learning_goal}':`];
    for (const [, c] of top) {
      lines.push(`  * '${c.title}' (${c.provider}) -- ${c.hours}h, ${c.level}`);
    }
    return lines.join('\n');
  },
});

const explainRecommendation = new DynamicStructuredTool({
  name: 'explain_recommendation',
  description: 'Generate a personalized explanation for why an item is recommended.',
  schema: z.object({
    item_title: z.string().describe('Title of the book or course being recommended'),
    user_interests: z.string().describe("User's stated interests and goals"),
  }),
  func: async ({ item_title, user_interests }) => {
    const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });
    const response = await llm.invoke(
      `Explain why '${item_title}' is a great recommendation for someone interested in: ${user_interests}. ` +
        'Be specific and compelling. 2-3 sentences.'
    );
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    return `Why '${item_title}': ${content.trim()}`;
  },
});

// ── Agent loop ───────────────────────────────────────────

const tools = [getBookRecommendations, getCourseRecommendations, explainRecommendation];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const RECOMMENDER_SYSTEM = `You are a personalized learning advisor.
When making recommendations:
1. Get book recommendations tailored to their interests and level
2. Suggest relevant courses based on their goal and time budget
3. Provide personalized explanations for top picks
4. Create a structured learning path recommendation`;

async function runRecommendationAgent(prompt: string): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 }).bindTools(tools);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(RECOMMENDER_SYSTEM),
    new HumanMessage(prompt),
  ];

  for (let i = 0; i < 6; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    for (const tc of toolCalls) {
      const tool = toolMap[tc.name];
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        messages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      }
    }
  }

  return 'Agent reached maximum iterations.';
}

// ── Wrap for Agentspan ───────────────────────────────────

const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    const output = await runRecommendationAgent(input.input);
    return { output };
  },
});

(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

async function main() {
  const runtime = new AgentRuntime();
  try {
    const result = await runtime.run(
      agentRunnable,
      "I'm an intermediate Python developer who wants to learn machine learning and LLM development. " +
        'I have about 30 hours available. What should I read and study?'
    );
    console.log('Status:', result.status);
    result.printResult();
  } finally {
    await runtime.shutdown();
  }
}

// Only run when executed directly (not when imported for discovery)
if (process.argv[1]?.endsWith('23-recommendation-agent.ts') || process.argv[1]?.endsWith('23-recommendation-agent.js')) {
  main().catch(console.error);
}
