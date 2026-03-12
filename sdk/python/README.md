<p align="center">
  <h1 align="center">Agentspan</h1>
  <p align="center"><strong>AI agents that survive crashes, scale to millions, and pause for human approval.</strong></p>
</p>

<p align="center">
  <a href="https://pypi.org/project/agentspan/"><img src="https://img.shields.io/pypi/v/agentspan.svg" alt="PyPI"></a>
  <a href="https://pypi.org/project/agentspan/"><img src="https://img.shields.io/pypi/pyversions/agentspan.svg" alt="Python"></a>
  <a href="https://github.com/agentspan-dev/agentspan/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

---

```python
from agentspan.agents import Agent, AgentRuntime, tool

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"72F and sunny in {city}"

agent = Agent(name="weatherbot", model="openai/gpt-4o", tools=[get_weather])

with AgentRuntime() as runtime:
    result = runtime.run(agent, "What's the weather in NYC?")
    result.print_result()
```

Every other agent SDK runs agents in-memory. **When the process dies, the agent dies.** Agentspan gives you durable, distributed agent execution backed by [Conductor](https://github.com/conductor-oss/conductor) workflows -- agents that survive crashes, tools that scale independently across languages, and human-in-the-loop workflows that can pause for days.

## Why Agentspan?

| | In-memory SDKs | Agentspan                              |
|---|---|----------------------------------------|
| **Process crashes** | Agent dies | Agent continues                        |
| **Tool scaling** | Single process | Distributed workers, any language      |
| **Human approval** | Minutes at best | Days or weeks                          |
| **Long-running tasks** | Process-bound | Workflow-bound (weeks+)                |
| **Debugging** | Log files | Visual workflow UI + execution history |
| **Observability** | Basic traces | Prometheus, OpenTelemetry, built-in UI |

## Install

```bash
pip install agentspan
```

This installs both the Python SDK and the `agentspan` CLI. Python 3.9+ required.

### Start the server

```bash
# Server needs API keys for the models to be used
# OpenAI (most common)
# export OPENAI_API_KEY=sk-...

# Anthropic (Claude)
# export ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
# export GEMINI_API_KEY=AI...
# export GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# see https://github.com/agentspan/agentspan/blob/main/docs/ai-models.md for the full list of configs

# Then start the server
agentspan server start
```

The server defaults to `http://localhost:8080/api`. If you skip this step, `AgentRuntime()` will auto-start the server for you.

### Configure (optional)

```bash
# Override the default server URL:
export AGENTSPAN_SERVER_URL=http://localhost:8080/api

# For Orkes Cloud:
# export AGENTSPAN_AUTH_KEY=your_key
# export AGENTSPAN_AUTH_SECRET=your_secret
```

## Quick Start

### Hello World

```python
from agentspan.agents import Agent, AgentRuntime

agent = Agent(name="greeter", model="openai/gpt-4o")

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Say hello and tell me a fun fact.")
    result.print_result()
```

### Tools

Decorate any Python function with `@tool`. The LLM sees the function name, docstring, and type hints -- then decides when to call it.

```python
from agentspan.agents import Agent, AgentRuntime, tool

@tool
def get_weather(city: str) -> dict:
    """Get the current weather for a city."""
    return {"city": city, "temp_f": 72, "condition": "Sunny"}

@tool
def get_stock_price(symbol: str) -> dict:
    """Get the current stock price for a ticker symbol."""
    return {"symbol": symbol, "price": 182.50, "change": "+1.2%"}

agent = Agent(
    name="assistant",
    model="openai/gpt-4o",
    tools=[get_weather, get_stock_price],
    instructions="You are a helpful assistant. Use tools to answer questions.",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "What's the weather like in San Francisco?")
    result.print_result()
```

### Structured Output

Return typed Pydantic models instead of free-form text.

```python
from pydantic import BaseModel
from agentspan.agents import Agent, AgentRuntime, tool

class WeatherReport(BaseModel):
    city: str
    temperature: float
    condition: str
    recommendation: str

@tool
def get_weather(city: str) -> dict:
    """Get current weather data for a city."""
    return {"city": city, "temp_f": 72, "condition": "Sunny", "humidity": 45}

agent = Agent(
    name="weather_reporter",
    model="openai/gpt-4o",
    tools=[get_weather],
    output_type=WeatherReport,
    instructions="You are a weather reporter. Get the weather and provide a recommendation.",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "What's the weather in NYC?")
    result.print_result()
```

## Multi-Agent Patterns

### Handoffs

An orchestrator agent delegates to specialist sub-agents. The LLM decides who handles each request.

```python
from agentspan.agents import Agent, AgentRuntime, Strategy, tool

@tool
def check_balance(account_id: str) -> dict:
    """Check the balance of a bank account."""
    return {"account_id": account_id, "balance": 5432.10, "currency": "USD"}

@tool
def lookup_order(order_id: str) -> dict:
    """Look up the status of an order."""
    return {"order_id": order_id, "status": "shipped", "eta": "2 days"}

billing = Agent(
    name="billing",
    model="openai/gpt-4o",
    instructions="You handle billing questions: balances, payments, invoices.",
    tools=[check_balance],
)

technical = Agent(
    name="technical",
    model="openai/gpt-4o",
    instructions="You handle technical questions: order status, shipping, returns.",
    tools=[lookup_order],
)

support = Agent(
    name="support",
    model="openai/gpt-4o",
    instructions="Route customer requests to the right specialist: billing or technical.",
    agents=[billing, technical],
    strategy=Strategy.HANDOFF,
)

with AgentRuntime() as runtime:
    result = runtime.run(support, "What's the balance on account ACC-123?")
    result.print_result()
```

### Sequential Pipeline

Chain agents with the `>>` operator. Output flows from one to the next.

```python
from agentspan.agents import Agent, AgentRuntime

researcher = Agent(
    name="researcher",
    model="openai/gpt-4o",
    instructions="You are a researcher. Given a topic, provide key facts and data points.",
)

writer = Agent(
    name="writer",
    model="openai/gpt-4o",
    instructions="You are a writer. Take research findings and write a clear, engaging article.",
)

editor = Agent(
    name="editor",
    model="openai/gpt-4o",
    instructions="You are an editor. Review the article for clarity, grammar, and tone.",
)

pipeline = researcher >> writer >> editor

with AgentRuntime() as runtime:
    result = runtime.run(pipeline, "The impact of AI agents on software development in 2025")
    result.print_result()
```

### Parallel Agents

Fan out to multiple agents concurrently, then aggregate results.

```python
from agentspan.agents import Agent, AgentRuntime, Strategy

market = Agent(
    name="market_analyst",
    model="openai/gpt-4o",
    instructions="Analyze the given topic from a market perspective: size, growth, key players.",
)

risk = Agent(
    name="risk_analyst",
    model="openai/gpt-4o",
    instructions="Analyze the given topic for risks: regulatory, technical, competitive threats.",
)

analysis = Agent(
    name="analysis",
    model="openai/gpt-4o",
    agents=[market, risk],
    strategy=Strategy.PARALLEL,
)

with AgentRuntime() as runtime:
    result = runtime.run(analysis, "Launching an AI-powered healthcare diagnostic tool in the US market")
    result.print_result()
```

## Human-in-the-Loop

Mark any tool as requiring approval. The workflow pauses -- for hours, days, or weeks -- until a human approves or rejects.

```python
from agentspan.agents import Agent, AgentRuntime, EventType, tool

@tool(approval_required=True)
def transfer_funds(from_acct: str, to_acct: str, amount: float) -> dict:
    """Transfer funds between accounts. Requires human approval."""
    return {"status": "completed", "from": from_acct, "to": to_acct, "amount": amount}

agent = Agent(
    name="banker",
    model="openai/gpt-4o",
    tools=[transfer_funds],
    instructions="You are a banking assistant. Help with transfers.",
)

with AgentRuntime() as runtime:
    handle = runtime.start(agent, "Transfer $500 from ACC-789 to ACC-456")
    print(f"Workflow started: {handle.workflow_id}\n")

    for event in handle.stream():
        if event.type == EventType.TOOL_CALL:
            print(f"  [tool_call] {event.tool_name}({event.args})")

        elif event.type == EventType.WAITING:
            print("--- Human approval required ---")
            handle.approve()  # or: handle.reject("Amount too high")

        elif event.type == EventType.DONE:
            print(f"\nResult: {event.output}")
```

## Guardrails

Validate LLM output before it reaches the user. Retry automatically on failure.

```python
import re
from agentspan.agents import (
    Agent, AgentRuntime, Guardrail, GuardrailResult, OnFail, Position, guardrail, tool,
)

@tool
def get_customer_info(customer_id: str) -> dict:
    """Retrieve customer details including payment info on file."""
    return {
        "customer_id": customer_id,
        "name": "Alice Johnson",
        "card_on_file": "4532-0150-1234-5678",
    }

@guardrail
def no_pii(content: str) -> GuardrailResult:
    """Reject responses that contain credit card numbers."""
    cc_pattern = r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    if re.search(cc_pattern, content):
        return GuardrailResult(
            passed=False,
            message="Response contains PII. Redact all card numbers before responding.",
        )
    return GuardrailResult(passed=True)

agent = Agent(
    name="support_agent",
    model="openai/gpt-4o",
    tools=[get_customer_info],
    guardrails=[
        Guardrail(no_pii, position=Position.OUTPUT, on_fail=OnFail.RETRY),
    ],
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "What's the profile for customer CUST-7?")
    result.print_result()
```

Built-in guardrail types: `RegexGuardrail` (pattern matching), `LLMGuardrail` (AI judge), or write your own with the `@guardrail` decorator. Failure modes: `RETRY`, `RAISE`, `FIX` (auto-correct), or `HUMAN` (pause for review).

## Streaming

Get real-time events as the agent thinks, calls tools, and produces output.

```python
from agentspan.agents import Agent, AgentRuntime

agent = Agent(
    name="haiku_writer",
    model="openai/gpt-4o",
    instructions="You are a haiku poet. Write a single haiku.",
)

with AgentRuntime() as runtime:
    for event in runtime.stream(agent, "Write a haiku about Python programming"):
        if event.type == "done":
            print(f"\nResult: {event.output}")
            print(f"Workflow: {event.workflow_id}")
        elif event.type == "error":
            print(f"[Error: {event.content}]")
```

## Server-Side Tools

Call HTTP APIs and MCP servers directly from Conductor -- no local workers needed.

```python
from agentspan.agents import Agent, AgentRuntime, tool, http_tool, mcp_tool

# HTTP endpoint as a tool (pure server-side, no worker needed)
weather_api = http_tool(
    name="get_current_weather",
    description="Get current weather for a city from the weather API",
    url="https://api.weather.com/v1/current",
    method="GET",
    input_schema={
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
)

# MCP server tools (discovered at runtime)
github_tools = mcp_tool(
    server_url="http://localhost:3001/mcp",
    name="github",
    description="GitHub operations via MCP",
)

agent = Agent(
    name="api_assistant",
    model="openai/gpt-4o",
    tools=[weather_api, github_tools],
    instructions="You have access to weather data and GitHub operations.",
)

with AgentRuntime() as runtime:
    result = runtime.run(agent, "Get the weather in London.")
    result.print_result()
```

## More Capabilities

| Feature | Description |
|---|---|
| **8 multi-agent strategies** | `handoff`, `sequential`, `parallel`, `router`, `round_robin`, `random`, `swarm`, `manual` |
| **`>>` pipeline operator** | Chain agents: `researcher >> writer >> editor` |
| **Async support** | `run_async`, `start_async`, `stream_async` -- full async/await API |
| **Termination conditions** | `MaxMessageTermination`, `TokenUsageTermination`, composable with `\|` and `&` |
| **Token tracking** | `result.token_usage` -- prompt, completion, and total tokens |
| **Code execution** | Local, Docker, Jupyter, or serverless sandboxes |
| **Semantic memory** | Long-term memory with vector retrieval |
| **OpenTelemetry** | Built-in tracing spans for full observability |
| **Media generation** | `image_tool`, `audio_tool`, `video_tool`, `pdf_tool` |
| **Prompt templates** | Reusable server-side templates |
| **Callbacks** | `before_model_callback`, `after_model_callback` hooks |
| **Google ADK compatibility** | Drop-in replacement -- same `google.adk.agents` API, backed by Conductor |

## Examples

### Getting Started

| Example | What you'll learn |
|---|---|
| [`01_basic_agent.py`](examples/01_basic_agent.py) | Minimal agent in 5 lines |
| [`02_tools.py`](examples/02_tools.py) | Tools with approval workflows |
| [`02a_simple_tools.py`](examples/02a_simple_tools.py) | Two tools, LLM picks the right one |
| [`02b_multi_step_tools.py`](examples/02b_multi_step_tools.py) | Chained tool calls |
| [`03_structured_output.py`](examples/03_structured_output.py) | Pydantic output types |
| [`11_streaming.py`](examples/11_streaming.py) | Real-time event streaming |

### Multi-Agent Orchestration

| Example | What you'll learn |
|---|---|
| [`05_handoffs.py`](examples/05_handoffs.py) | Agent delegation |
| [`06_sequential_pipeline.py`](examples/06_sequential_pipeline.py) | `>>` pipeline operator |
| [`07_parallel_agents.py`](examples/07_parallel_agents.py) | Fan-out / fan-in |
| [`08_router_agent.py`](examples/08_router_agent.py) | LLM routing to specialists |
| [`13_hierarchical_agents.py`](examples/13_hierarchical_agents.py) | Nested agent teams |
| [`15_agent_discussion.py`](examples/15_agent_discussion.py) | Round-robin debate |
| [`16_random_strategy.py`](examples/16_random_strategy.py) | Random agent selection |
| [`17_swarm_orchestration.py`](examples/17_swarm_orchestration.py) | Swarm with handoff conditions |
| [`18_manual_selection.py`](examples/18_manual_selection.py) | Human picks which agent speaks |
| [`20_constrained_transitions.py`](examples/20_constrained_transitions.py) | Restricted agent transitions |
| [`41_sequential_pipeline_tools.py`](examples/41_sequential_pipeline_tools.py) | Sequential pipeline with per-stage tools |
| [`45_agent_tool.py`](examples/45_agent_tool.py) | Use an agent as a tool |
| [`46_transfer_control.py`](examples/46_transfer_control.py) | Explicit control transfer between agents |
| [`52_nested_strategies.py`](examples/52_nested_strategies.py) | Nested multi-agent strategies |

### Human-in-the-Loop

| Example | What you'll learn |
|---|---|
| [`09_human_in_the_loop.py`](examples/09_human_in_the_loop.py) | Approval workflows |
| [`09b_hitl_with_feedback.py`](examples/09b_hitl_with_feedback.py) | Custom feedback via respond API |
| [`09c_hitl_streaming.py`](examples/09c_hitl_streaming.py) | Streaming + HITL approval |
| [`27_user_proxy_agent.py`](examples/27_user_proxy_agent.py) | Human stand-in for interactive conversations |

### Guardrails & Safety

| Example | What you'll learn |
|---|---|
| [`10_guardrails.py`](examples/10_guardrails.py) | Output validation + retry |
| [`21_regex_guardrails.py`](examples/21_regex_guardrails.py) | Regex pattern guardrails |
| [`22_llm_guardrails.py`](examples/22_llm_guardrails.py) | LLM-as-judge guardrails |
| [`31_tool_guardrails.py`](examples/31_tool_guardrails.py) | Pre-execution validation on tool inputs |
| [`32_human_guardrail.py`](examples/32_human_guardrail.py) | Pause for human review on failure |
| [`35_standalone_guardrails.py`](examples/35_standalone_guardrails.py) | Guardrails without an agent |
| [`36_simple_agent_guardrails.py`](examples/36_simple_agent_guardrails.py) | Guardrails on tool-free agents |
| [`37_fix_guardrail.py`](examples/37_fix_guardrail.py) | Auto-correct with `on_fail="fix"` |
| [`42_security_testing.py`](examples/42_security_testing.py) | Red-team security testing |
| [`43_data_security_pipeline.py`](examples/43_data_security_pipeline.py) | Data redaction pipeline |
| [`44_safety_guardrails.py`](examples/44_safety_guardrails.py) | PII detection and sanitization |

### Server-Side Tools & Integrations

| Example | What you'll learn |
|---|---|
| [`04_http_and_mcp_tools.py`](examples/04_http_and_mcp_tools.py) | HTTP and MCP server tools |
| [`04_mcp_weather.py`](examples/04_mcp_weather.py) | MCP server tools (live weather) |
| [`14_existing_workers.py`](examples/14_existing_workers.py) | Existing Conductor workers as tools |
| [`33_external_workers.py`](examples/33_external_workers.py) | Workers in other services |
| [`40_media_generation_agent.py`](examples/40_media_generation_agent.py) | Image, audio, and video generation |

### Advanced

| Example | What you'll learn |
|---|---|
| [`12_long_running.py`](examples/12_long_running.py) | Fire-and-forget with polling |
| [`19_composable_termination.py`](examples/19_composable_termination.py) | Composable termination conditions |
| [`23_token_tracking.py`](examples/23_token_tracking.py) | Token usage and cost tracking |
| [`24_code_execution.py`](examples/24_code_execution.py) | Code execution sandboxes |
| [`25_semantic_memory.py`](examples/25_semantic_memory.py) | Long-term memory with retrieval |
| [`26_opentelemetry_tracing.py`](examples/26_opentelemetry_tracing.py) | OpenTelemetry observability |
| [`28_gpt_assistant_agent.py`](examples/28_gpt_assistant_agent.py) | OpenAI Assistants API wrapper |
| [`29_agent_introductions.py`](examples/29_agent_introductions.py) | Agents introduce themselves |
| [`30_multimodal_agent.py`](examples/30_multimodal_agent.py) | Image/video analysis |
| [`33_single_turn_tool.py`](examples/33_single_turn_tool.py) | Single-turn tool execution |
| [`34_prompt_templates.py`](examples/34_prompt_templates.py) | Reusable prompt templates |
| [`38_tech_trends.py`](examples/38_tech_trends.py) | Research agent with tools |
| [`39_local_code_execution.py`](examples/39_local_code_execution.py) | Local code sandbox |
| [`47_callbacks.py`](examples/47_callbacks.py) | Before/after model callbacks |
| [`48_planner.py`](examples/48_planner.py) | Planning mode |
| [`49_include_contents.py`](examples/49_include_contents.py) | Include file contents in context |
| [`50_thinking_config.py`](examples/50_thinking_config.py) | Extended thinking configuration |
| [`51_shared_state.py`](examples/51_shared_state.py) | Shared state between agents |

### Google ADK Compatibility

Drop-in replacement for the [Google ADK](https://github.com/google/adk-python) API, backed by Conductor's durable execution engine. See [`examples/adk/`](examples/adk/) for 28+ examples.

```python
from google.adk.agents import Agent, SequentialAgent

researcher = Agent(name="researcher", model="gemini-2.0-flash",
                   instruction="Research the topic.", tools=[search])
writer = Agent(name="writer", model="gemini-2.0-flash",
               instruction="Write an article from the research.")

pipeline = SequentialAgent(name="pipeline", sub_agents=[researcher, writer])
```

## API Reference

See [AGENTS.md](AGENTS.md) for the complete API reference and architecture guide.

## License

Apache 2.0
