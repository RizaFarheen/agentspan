# Agentspan — Build Durable AI Agents

Agentspan is a distributed, durable runtime for AI agents. Agents survive crashes, scale across machines, and pause for human approval. Use Python SDK.

## Quickstart (3 lines)

```python
from agentspan.agents import Agent, AgentRuntime

agent = Agent(name="helper", model="openai/gpt-4o", instructions="You are a helpful assistant.")

with AgentRuntime() as rt:
    result = rt.run(agent, "What is quantum computing?")
    print(result.output)
```

## Production Pattern

```python
from agentspan.agents import Agent, AgentRuntime

agent = Agent(name="helper", model="openai/gpt-4o", instructions="...")

if __name__ == "__main__":
    with AgentRuntime() as rt:
        rt.deploy(agent)   # Push definition to server (idempotent)
        rt.serve(agent)    # Start workers, poll for tasks (blocks)
```

Deploy can also be done via CLI (recommended for CI/CD): `agentspan deploy my_module`

Trigger from outside: `agentspan run helper "What is quantum computing?"`

## Agent

```python
Agent(
    name="my_agent",                    # Required. Unique name.
    model="openai/gpt-4o",             # "provider/model" format
    instructions="You are a ...",       # System prompt (str or callable)
    tools=[my_tool],                    # List of @tool functions
    max_turns=25,                       # Max LLM iterations
    timeout_seconds=0,                  # 0 = no timeout
)
```

Model formats: `"openai/gpt-4o"`, `"anthropic/claude-sonnet-4-6"`, `"google_gemini/gemini-2.5-flash"`, `"claude-code/opus"`

## Tools

```python
from agentspan.agents import tool

@tool
def search(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

@tool(approval_required=True)
def delete_file(path: str) -> str:
    """Delete a file. Requires human approval."""
    os.remove(path)
    return f"Deleted {path}"
```

Tool functions must have type hints and a docstring. The schema is generated automatically.

### Server-side tools (no local worker needed)

```python
from agentspan.agents import http_tool, mcp_tool, api_tool

weather = http_tool(
    name="get_weather",
    description="Get weather for a city",
    url="https://api.weather.com/v1/current?city=${city}",
    credentials=["WEATHER_API_KEY"],
)

github = mcp_tool(
    server_url="https://mcp.github.com",
    tool_names=["create_issue", "list_repos"],
    credentials=["GITHUB_TOKEN"],
)

stripe = api_tool(
    url="https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    tool_names=["CreatePaymentIntent", "ListCustomers"],
    credentials=["STRIPE_SECRET_KEY"],
)
```

## Multi-Agent

### Sequential Pipeline (>>)

```python
researcher = Agent(name="researcher", model="openai/gpt-4o", instructions="Research the topic.")
writer = Agent(name="writer", model="openai/gpt-4o", instructions="Write a summary.")

pipeline = researcher >> writer
```

### Parallel

```python
Agent(
    name="analysis",
    model="openai/gpt-4o",
    agents=[pros_agent, cons_agent],
    strategy="parallel",
)
```

### Router

```python
router_agent = Agent(name="router", model="openai/gpt-4o", instructions="Route to the right specialist.")

Agent(
    name="team",
    model="openai/gpt-4o",
    agents=[billing, technical],
    strategy="router",
    router=router_agent,
)
```

### SWARM (peer-to-peer handoff)

```python
from agentspan.agents.handoff import OnTextMention

coder = Agent(name="coder", model="openai/gpt-4o", instructions="Code. Say HANDOFF_TO_QA when done.")
qa = Agent(name="qa", model="openai/gpt-4o", instructions="Test. Say HANDOFF_TO_CODER if bugs found.")

Agent(
    name="dev_team",
    model="openai/gpt-4o",
    agents=[coder, qa],
    strategy="swarm",
    handoffs=[
        OnTextMention(text="HANDOFF_TO_QA", target="qa"),
        OnTextMention(text="HANDOFF_TO_CODER", target="coder"),
    ],
)
```

## Guardrails

```python
from agentspan.agents import RegexGuardrail, LLMGuardrail, Guardrail, GuardrailResult

# Regex: block emails in output
RegexGuardrail(
    name="no_emails",
    patterns=[r"[\w.+-]+@[\w-]+\.[\w.-]+"],
    message="Remove email addresses.",
    on_fail="retry",    # retry | raise | fix | human
)

# LLM: policy-based check
LLMGuardrail(
    name="safety",
    model="openai/gpt-4o-mini",
    policy="Reject responses with medical advice.",
    on_fail="raise",
)

# Custom function
def no_ssn(content: str) -> GuardrailResult:
    if re.search(r"\b\d{3}-\d{2}-\d{4}\b", content):
        return GuardrailResult(passed=False, message="Redact SSNs.")
    return GuardrailResult(passed=True)

Guardrail(no_ssn, position="output", on_fail="retry", max_retries=3)
```

## Termination Conditions

```python
from agentspan.agents import TextMentionTermination, MaxMessageTermination

Agent(
    name="worker",
    model="openai/gpt-4o",
    instructions="Say DONE when finished.",
    termination=TextMentionTermination("DONE"),
    # OR: termination=MaxMessageTermination(10),
    # Composable: termination=TextMentionTermination("DONE") | MaxMessageTermination(10),
)
```

## Gates (Conditional Pipelines)

```python
from agentspan.agents.gate import TextGate

checker = Agent(name="checker", model="openai/gpt-4o",
    instructions="Output NO_ISSUES if everything is fine.",
    gate=TextGate("NO_ISSUES"),  # Stops pipeline if text present
)
fixer = Agent(name="fixer", model="openai/gpt-4o", instructions="Fix the issue.")

pipeline = checker >> fixer  # fixer only runs if checker finds issues
```

## Claude Code Agents

```python
from agentspan.agents import Agent, ClaudeCode

# Simple: slash syntax
reviewer = Agent(
    name="reviewer",
    model="claude-code/sonnet",
    instructions="Review code for quality.",
    tools=["Read", "Glob", "Grep"],     # Built-in Claude tools (strings only)
    max_turns=10,
)

# With config
reviewer = Agent(
    name="reviewer",
    model=ClaudeCode("opus", permission_mode=ClaudeCode.PermissionMode.ACCEPT_EDITS),
    instructions="Review code.",
    tools=["Read", "Edit", "Bash"],
)
```

Available tools: `Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`

## CLI Execution

```python
Agent(
    name="deployer",
    model="openai/gpt-4o",
    instructions="Use git and gh to manage repos.",
    cli_commands=True,
    cli_allowed_commands=["git", "gh", "curl"],
    credentials=["GITHUB_TOKEN"],
)
```

## Code Execution

```python
Agent(
    name="data_scientist",
    model="openai/gpt-4o",
    instructions="Write and run Python code to analyze data.",
    local_code_execution=True,
    allowed_languages=["python"],
)
```

## Credentials

Credentials are always resolved from the server. No env var fallback.

```bash
# Store credentials on server
agentspan credentials set --name GITHUB_TOKEN
agentspan credentials set --name OPENAI_API_KEY
```

```python
Agent(
    name="github_agent",
    model="openai/gpt-4o",
    credentials=["GITHUB_TOKEN"],  # Resolved at tool execution time
    tools=[my_github_tool],
)
```

## Callbacks

```python
from agentspan.agents import CallbackHandler

class MyCallbacks(CallbackHandler):
    def on_agent_start(self, **kwargs): pass
    def on_agent_end(self, **kwargs): pass
    def on_model_start(self, **kwargs): pass
    def on_model_end(self, **kwargs): pass

Agent(name="agent", model="openai/gpt-4o", callbacks=[MyCallbacks()])
```

## Structured Output

```python
from pydantic import BaseModel

class Analysis(BaseModel):
    sentiment: str
    confidence: float
    summary: str

Agent(name="analyzer", model="openai/gpt-4o", output_type=Analysis)
```

## Framework Integration

### LangGraph

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o")
graph = create_react_agent(llm, tools=[my_tool])

with AgentRuntime() as rt:
    rt.deploy(graph)
    rt.serve(graph)
```

### OpenAI Agents SDK

```python
from agents import Agent as OpenAIAgent
from agentspan.agents import AgentRuntime

agent = OpenAIAgent(name="helper", instructions="...", model="gpt-4o")

with AgentRuntime() as rt:
    rt.deploy(agent)
    rt.serve(agent)
```

## Execution API

```python
with AgentRuntime() as rt:
    # Deploy: push definition to server
    rt.deploy(agent)

    # Serve: start workers, block (production)
    rt.serve(agent)

    # Run: deploy + serve + execute (quickstart)
    result = rt.run(agent, "prompt")

    # Run by name: trigger a deployed agent
    result = rt.run("agent_name", "prompt")

    # Stream: real-time events
    stream = rt.stream(agent, "prompt")
    for event in stream:
        print(event)
    result = stream.get_result()

    # Start: async handle
    handle = rt.start(agent, "prompt")
    status = rt.get_status(handle.workflow_id)
```

## Key Rules

1. **Agent names must be unique** — alphanumeric + underscore/hyphen, start with letter
2. **Tools need type hints + docstring** — schema is auto-generated
3. **Credentials come from server** — no env var fallback, `FAILED_WITH_TERMINAL_ERROR` if missing
4. **Task names are agent-prefixed** — `{agentName}_run_command`, `{agentName}_execute_code`
5. **Deploy is idempotent** — safe to call on every startup
6. **Serve blocks** — run triggering comes from outside (CLI, API, another process)
7. **Claude Code tools are strings** — `["Read", "Edit", "Bash"]`, not @tool functions
