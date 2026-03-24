/**
 * OpenAI Agent with Dynamic Instructions -- callable instruction function.
 *
 * Demonstrates:
 *   - Using a callable function for dynamic instructions
 *   - Instructions that change based on context (time of day, user info)
 *   - Function tools alongside dynamic instructions
 *
 * Requirements:
 *   - Conductor server with OpenAI LLM integration configured
 *   - AGENTSPAN_SERVER_URL=http://localhost:8080/api as environment variable
 *   - AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini as environment variable
 */

import { AgentRuntime } from '../../src/index.js';
import { llmModel } from '../settings.js';

// -- Dynamic instructions --------------------------------------------------

function getDynamicInstructions(): string {
  const hour = new Date().getHours();
  let greetingStyle: string;
  let tone: string;
  if (hour < 12) {
    greetingStyle = 'cheerful morning';
    tone = 'energetic and upbeat';
  } else if (hour < 17) {
    greetingStyle = 'professional afternoon';
    tone = 'focused and efficient';
  } else {
    greetingStyle = 'relaxed evening';
    tone = 'calm and conversational';
  }
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return (
    `You are a personal assistant with a ${greetingStyle} style. ` +
    `Respond in a ${tone} tone. ` +
    `Current time: ${time}. ` +
    `Always be helpful and use available tools when appropriate.`
  );
}

// -- Tools -----------------------------------------------------------------

function getTodoList(): string {
  const todos = [
    'Review PR #42 -- high priority',
    'Write unit tests for auth module',
    'Team standup at 2pm',
    'Deploy v2.1 to staging',
  ];
  return todos.map((t) => `- ${t}`).join('\n');
}

function addTodo(task: string, priority: string = 'medium'): string {
  return `Added to todo list: '${task}' (priority: ${priority})`;
}

// -- Mock OpenAI Agent with dynamic instructions --------------------------

const agent = {
  run: async (prompt: string) => ({ output: `Assistant: ${prompt}` }),
  tools: [
    {
      name: 'get_todo_list',
      description: "Get the user's current todo list.",
      fn: getTodoList,
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'add_todo',
      description: 'Add a new item to the todo list.',
      fn: addTodo,
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          priority: { type: 'string', default: 'medium' },
        },
        required: ['task'],
      },
    },
  ],
  model: llmModel,
  name: 'personal_assistant',
  instructions: getDynamicInstructions,
  _openai_agent: true,
};

const runtime = new AgentRuntime();
try {
  const result = await runtime.run(
    agent,
    "Show me my todo list and add 'Prepare demo for Friday' as high priority.",
  );
  result.printResult();
} finally {
  await runtime.shutdown();
}
