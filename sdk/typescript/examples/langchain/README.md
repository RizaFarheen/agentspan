# LangChain + Agentspan

Keep your existing LangChain code. Add agentspan metadata and swap `.invoke()` for `runtime.run()`.

## Simple chain (no tools)

<table>
<tr><th>Before (vanilla LangChain)</th><th>After (agentspan)</th></tr>
<tr><td>

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate }
  from '@langchain/core/prompts';
import { StringOutputParser }
  from '@langchain/core/output_parsers';



const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise assistant.'],
  ['human', '{input}'],
]);

const chain = prompt
  .pipe(model)
  .pipe(new StringOutputParser());




const result = await chain.invoke({
  input: 'Tell me a fun fact.',
});
console.log(result);
```

</td><td>

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate }
  from '@langchain/core/prompts';
import { StringOutputParser }
  from '@langchain/core/output_parsers';
import { AgentRuntime } from '@agentspan/sdk';
// ^^^ add agentspan import

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise assistant.'],
  ['human', '{input}'],
]);

const chain = prompt
  .pipe(model)
  .pipe(new StringOutputParser());

// Add agentspan metadata for extraction
(chain as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools: [],
  framework: 'langchain',
};

const runtime = new AgentRuntime();
const result = await runtime.run(
// ^^^ runtime.run() instead of chain.invoke()
  chain, 'Tell me a fun fact.',
);
result.printResult();
await runtime.shutdown();
```

</td></tr>
</table>

## With tools (ReAct pattern)

For agents with tool-calling loops, wrap the loop in a `RunnableLambda`.

<table>
<tr><th>Before (vanilla LangChain)</th><th>After (agentspan)</th></tr>
<tr><td>

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool }
  from '@langchain/core/tools';
import { HumanMessage, AIMessage,
  ToolMessage, SystemMessage }
  from '@langchain/core/messages';

import { z } from 'zod';

const tools = [new DynamicStructuredTool({
  name: 'get_population',
  description: 'Get country population.',
  schema: z.object({ country: z.string() }),
  func: async ({ country }) =>
    `${country}: ~335 million`,
})];

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
}).bindTools(tools);

// Manual tool-calling loop
const messages = [
  new SystemMessage('You look up data.'),
  new HumanMessage('Population of USA?'),
];
for (let i = 0; i < 5; i++) {
  const res = await model.invoke(messages);
  messages.push(res);
  if (!res.tool_calls?.length) break;
  for (const tc of res.tool_calls) {
    const tool = tools.find(
      t => t.name === tc.name
    );
    const out = await tool!.invoke(tc.args);
    messages.push(new ToolMessage({
      content: String(out),
      tool_call_id: tc.id!,
    }));
  }
}
```

</td><td>

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool }
  from '@langchain/core/tools';
import { HumanMessage, AIMessage,
  ToolMessage, SystemMessage }
  from '@langchain/core/messages';
import { RunnableLambda }
  from '@langchain/core/runnables';
// ^^^ add RunnableLambda for wrapping
import { z } from 'zod';
import { AgentRuntime } from '@agentspan/sdk';
// ^^^ add agentspan import

const tools = [new DynamicStructuredTool({
  /* ... same tool definitions ... */
})];

// Same agent loop, wrapped in RunnableLambda
const agentRunnable = new RunnableLambda({
  func: async (input: { input: string }) => {
    // ... same loop logic inside ...
    return { output: finalResult };
  },
});

// Add agentspan metadata
(agentRunnable as any)._agentspan = {
  model: 'openai/gpt-4o-mini',
  tools,
  framework: 'langchain',
};

const runtime = new AgentRuntime();
const result = await runtime.run(
  agentRunnable, 'Population of USA?',
);
result.printResult();
await runtime.shutdown();
```

</td></tr>
</table>

### What changes — summary

| What | Change |
|------|--------|
| **Imports** | Add `AgentRuntime` from `@agentspan/sdk` |
| **Chain / agent** | No changes to construction |
| **Metadata** | Add `(chain as any)._agentspan = { model, tools, framework: 'langchain' }` |
| **Execution** | `chain.invoke(input)` → `runtime.run(chain, prompt)` |
| **Tools** | No changes — `DynamicStructuredTool` works as-is |

## Examples

| File | Description |
|------|-------------|
| `01-hello-world.ts` | Simple prompt → model → output chain |
| `02-react-with-tools.ts` | Manual tool-calling loop with 3 tools |
| `03-custom-tools.ts` | Complex tools (unit conversion, formatting) |
| `04-structured-output.ts` | Structured output parsing |
| `05-prompt-templates.ts` | ChatPromptTemplate patterns |
| `06-chat-history.ts` | Conversation history management |
| `07-memory-agent.ts` | Stateful in-memory profile store |
| `08-multi-tool-agent.ts` | Multiple tools in a single agent |
| `09-math-calculator.ts` | Math expression evaluation |
| `10-web-search-agent.ts` | Web search simulation |

## Running

```bash
export AGENTSPAN_SERVER_URL=...
export OPENAI_API_KEY=...
cd sdk/typescript
npx tsx examples/langchain/01-hello-world.ts
```
