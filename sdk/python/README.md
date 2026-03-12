<p align="center">
  <h1 align="center">AgentSpan</h1>
  <p align="center"><strong>AI agents that survive crashes, scale to millions, and pause for human approval.</strong></p>
</p>

<p align="center">
  <a href="https://pypi.org/project/agentspan/"><img src="https://img.shields.io/pypi/v/agentspan.svg" alt="PyPI"></a>
  <a href="https://pypi.org/project/agentspan/"><img src="https://img.shields.io/pypi/pyversions/agentspan.svg" alt="Python"></a>
  <a href="https://github.com/agentspan-dev/agentspan/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

---

```python
from agentspan.agents import Agent, tool, run

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"72F and sunny in {city}"

agent = Agent(name="weatherbot", model="openai/gpt-4o", tools=[get_weather])
result = run(agent, "What's the weather in NYC?")
```

Every other agent SDK runs agents in-memory. **When the process dies, the agent dies.** AgentSpan gives you durable, distributed agent execution backed by [Conductor](https://github.com/conductor-oss/conductor) workflows -- agents that survive crashes, tools that scale independently across languages, and human-in-the-loop workflows that can pause for days.

## Why AgentSpan?

| | In-memory SDKs | AgentSpan |
|---|---|---|
| **Process crashes** | Agent dies | Agent continues |
| **Tool scaling** | Single process | Distributed workers, any language |
| **Human approval** | Minutes at best | Days or weeks |
| **Long-running tasks** | Process-bound | Workflow-bound (weeks+) |
| **Debugging** | Log files | Visual workflow UI + execution history |
| **Observability** | Basic traces | Prometheus, OpenTelemetry, built-in UI |

## Install

```bash
pip install agentspan
```

**Prerequisites:** Python 3.9+ and a running [Conductor](https://github.com/conductor-oss/conductor) server with LLM support.

```bash
export CONDUCTOR_SERVER_URL=http://localhost:7001/api

# For Orkes Cloud:
# export CONDUCTOR_AUTH_KEY=your_key
# export CONDUCTOR_AUTH_SECRET=your_secret
```

## Quick Start

### Hello World

```python
from agentspan.agents import Agent, run

agent = Agent(name="hello", model="openai/gpt-4o")
result = run(agent, "Say hello and tell me a fun fact.")
print(result.output)
print(f"Workflow: {result.workflow_id}")  # View in Conductor UI
```

### Tools

Decorate any Python function with `@tool`. The LLM sees the function name, docstring, and type hints -- then decides when to call it.

```python
from agentspan.agents import Agent, tool, run

@tool
def get_weather(city: str) -> dict:
    """Get current weather for a city."""
    return {"city": city, "temp": 72, "condition": "Sunny"}

@tool
def calculate(expression: str) -> dict:
    """Evaluate a math expression."""
    return {"result": eval(expression)}

agent = Agent(
    name="assistant",
    model="openai/gpt-4o",
    tools=[get_weather, calculate],
    instructions="You are a helpful assistant.",
)

result = run(agent, "What's the weather in NYC? Also, what's 42 * 17?")
print(result.output)
```

### Structured Output

Return typed Pydantic models instead of free-form text.

```python
from pydantic import BaseModel
from agentspan.agents import Agent, tool, run

class WeatherReport(BaseModel):
    city: str
    temperature: float
    condition: str
    recommendation: str

@tool
def get_weather(city: str) -> dict:
    """Get weather data for a city."""
    return {"city": city, "temp_f": 72, "condition": "Sunny", "humidity": 45}

agent = Agent(
    name="weather_reporter",
    model="openai/gpt-4o",
    tools=[get_weather],
    output_type=WeatherReport,
)

result = run(agent, "What's the weather in NYC?")
report: WeatherReport = result.output
print(f"{report.city}: {report.temperature}F, {report.condition}")
print(f"Recommendation: {report.recommendation}")
```

## Multi-Agent Patterns

### Handoffs

An orchestrator agent delegates to specialist sub-agents. The LLM decides who handles each request.

```python
from agentspan.agents import Agent, tool, run

@tool
def check_balance(account_id: str) -> dict:
    """Check account balance."""
    return {"account_id": account_id, "balance": 5432.10}

billing = Agent(
    name="billing",
    model="openai/gpt-4o",
    instructions="Handle billing: balances, payments, invoices.",
    tools=[check_balance],
)

technical = Agent(
    name="technical",
    model="openai/gpt-4o",
    instructions="Handle technical: orders, shipping, returns.",
)

support = Agent(
    name="support",
    model="openai/gpt-4o",
    instructions="Route customer requests to billing or technical.",
    agents=[billing, technical],
    strategy="handoff",
)

result = run(support, "What's the balance on account ACC-123?")
```

### Sequential Pipeline

Chain agents with the `>>` operator. Output flows from one to the next.

```python
from agentspan.agents import Agent, run

researcher = Agent(name="researcher", model="openai/gpt-4o",
                   instructions="Research the topic and provide key facts.")
writer = Agent(name="writer", model="openai/gpt-4o",
               instructions="Write an engaging article from the research.")
editor = Agent(name="editor", model="openai/gpt-4o",
               instructions="Polish the article for publication.")

pipeline = researcher >> writer >> editor
result = run(pipeline, "AI agents in software development")
print(result.output)
```

### Parallel Agents

Fan out to multiple agents concurrently, then aggregate results.

```python
from agentspan.agents import Agent, run

market = Agent(name="market", model="openai/gpt-4o",
               instructions="Analyze market size, growth, key players.")
risk = Agent(name="risk", model="openai/gpt-4o",
             instructions="Analyze regulatory, technical, competitive risks.")

analysis = Agent(
    name="analysis",
    model="openai/gpt-4o",
    agents=[market, risk],
    strategy="parallel",
)

result = run(analysis, "Launching an AI healthcare tool in the US")
```

## Human-in-the-Loop

Mark any tool as requiring approval. The workflow pauses -- for hours, days, or weeks -- until a human approves or rejects.

```python
from agentspan.agents import Agent, tool, start

@tool(approval_required=True)
def transfer_funds(from_acct: str, to_acct: str, amount: float) -> dict:
    """Transfer funds between accounts."""
    return {"status": "completed", "amount": amount}

agent = Agent(name="banker", model="openai/gpt-4o", tools=[transfer_funds])
handle = start(agent, "Transfer $5000 from checking to savings")

# Later -- from any process, any machine:
status = handle.get_status()
if status.is_waiting:
    handle.approve()   # or: handle.reject("Amount too high")
```

## Guardrails

Validate LLM output before it reaches the user. Retry automatically on failure.

```python
from agentspan.agents import Agent, Guardrail, GuardrailResult, OnFail, guardrail, run

@guardrail
def word_limit(content: str) -> GuardrailResult:
    """Keep responses concise."""
    if len(content.split()) > 500:
        return GuardrailResult(passed=False, message="Too long. Be more concise.")
    return GuardrailResult(passed=True)

agent = Agent(
    name="concise_bot",
    model="openai/gpt-4o",
    guardrails=[Guardrail(word_limit, on_fail=OnFail.RETRY)],
)

result = run(agent, "Explain quantum computing.")
```

Built-in guardrail types: `RegexGuardrail` (pattern matching), `LLMGuardrail` (AI judge), or write your own with the `@guardrail` decorator. Failure modes: `RETRY`, `RAISE`, `FIX` (auto-correct), or `HUMAN` (pause for review).

## Streaming

Get real-time events as the agent thinks, calls tools, and produces output.

```python
from agentspan.agents import Agent, stream

agent = Agent(name="writer", model="openai/gpt-4o")
for event in stream(agent, "Write a haiku about Python"):
    match event.type:
        case "tool_call":       print(f"Calling {event.tool_name}...")
        case "thinking":        print(f"Thinking: {event.content}")
        case "guardrail_pass":  print(f"Guardrail passed: {event.guardrail_name}")
        case "guardrail_fail":  print(f"Guardrail failed: {event.guardrail_name}")
        case "done":            print(f"\n{event.output}")
```

## Server-Side Tools

Call HTTP APIs and MCP servers directly from Conductor -- no local workers needed.

```python
from agentspan.agents import Agent, http_tool, mcp_tool, run

# Any HTTP endpoint becomes a tool
weather_api = http_tool(
    name="get_weather",
    description="Get weather for a city",
    url="https://api.weather.com/v1/current",
    method="GET",
    input_schema={"type": "object", "properties": {"city": {"type": "string"}}},
)

# MCP server -- tools are discovered automatically
github = mcp_tool(server_url="http://localhost:8080/mcp")

agent = Agent(name="assistant", model="openai/gpt-4o", tools=[weather_api, github])
result = run(agent, "What's the weather in NYC?")
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
