/**
 * Recommendation Agent -- personalized recommendations based on user preferences.
 *
 * Demonstrates:
 *   - User profile-aware recommendation engine
 *   - Filtering and ranking candidate items by preference match
 *   - Explanation-driven recommendations with reasoning
 *   - Practical use case: personalized product or content recommendation
 *
 * In production you would use:
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { tool } from '@langchain/core/tools';
 *   import { createReactAgent } from 'langchain/agents';
 */

import { AgentRuntime } from '../../src/index.js';

// -- Mock catalog --

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

function getBookRecommendations(interests: string, skillLevel = 'intermediate', maxResults = 3): string {
  const interestList = interests.split(',').map((i) => i.trim().toLowerCase());

  const candidates: Array<{ score: number; book: Book }> = [];
  for (const book of BOOKS) {
    const genreMatch = interestList.some((i) => book.genre.includes(i) || i.includes(book.genre));
    const levelMatch = book.level === skillLevel || book.level === 'all';
    if (genreMatch || levelMatch) {
      const score = (genreMatch ? 1 : 0) + (levelMatch ? 1 : 0) + book.rating / 5;
      candidates.push({ score, book });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, maxResults);

  if (top.length === 0) return 'No matching books found. Try broader interests.';

  const lines = [`Top ${top.length} book recommendations:`];
  for (const { book } of top) {
    lines.push(`  '${book.title}' by ${book.author} [${book.genre}, ${book.level}, rating ${book.rating}]`);
  }
  return lines.join('\n');
}

function getCourseRecommendations(learningGoal: string, availableHours = 20): string {
  const goalLower = learningGoal.toLowerCase();
  const candidates: Array<{ fitScore: number; course: Course }> = [];

  for (const course of COURSES) {
    const titleMatch = goalLower.split(/\s+/).some((w) => course.title.toLowerCase().includes(w));
    const timeMatch = course.hours <= availableHours * 1.2;
    if (titleMatch || timeMatch) {
      const fitScore = (titleMatch ? 1 : 0) + (timeMatch ? 1 : 0);
      candidates.push({ fitScore, course });
    }
  }

  candidates.sort((a, b) => b.fitScore - a.fitScore || a.course.hours - b.course.hours);
  const top = candidates.slice(0, 3);

  if (top.length === 0) return 'No matching courses found.';

  const lines = [`Course recommendations for '${learningGoal}':`];
  for (const { course } of top) {
    lines.push(`  '${course.title}' (${course.provider}) -- ${course.hours}h, ${course.level}`);
  }
  return lines.join('\n');
}

function explainRecommendation(itemTitle: string, userInterests: string): string {
  return `Why '${itemTitle}': This resource aligns well with your interests in ${userInterests}. ` +
    'It provides practical, hands-on coverage of the topic with a focus on real-world applications, ' +
    'making it an excellent choice for intermediate developers looking to level up.';
}

// -- Mock LangChain AgentExecutor --
const langchainAgent = {
  invoke: async (input: { input: string }, _config?: any) => {
    const output = [
      getBookRecommendations('machine learning, programming', 'intermediate', 3),
      '',
      getCourseRecommendations('machine learning and LLM development', 30),
      '',
      explainRecommendation('Hands-On Machine Learning', 'machine learning and LLM development'),
    ].join('\n');

    return { output };
  },
  lc_namespace: ['langchain', 'agents'],
};

async function main() {
  const runtime = new AgentRuntime();

  console.log('Running recommendation agent via Agentspan...');
  const result = await runtime.run(
    langchainAgent,
    'I\'m an intermediate Python developer who wants to learn machine learning and LLM development. ' +
      'I have about 30 hours available. What should I read and study?',
  );

  console.log(`Status: ${result.status}`);
  result.printResult();

  await runtime.shutdown();
}

main().catch(console.error);
