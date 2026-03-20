# Claude Agent SDK — MCP Bridge Architecture

**Date:** 2026-03-20
**Status:** Approved
**Replaces:** `docs/superpowers/plans/2026-03-19-claude-agent-sdk-integration.md` (Tier 1/2/3 design)

---

## Problem Statement

The previous 3-tier architecture (hook interception, transport replacement) was fragile:
- Tier 2 hook-based subagents timed out (~60s IPC timeout on Claude CLI's hook stream)
- Tier 3 `AgentspanTransport` bypassed the SDK's native MCP support and session management
- Neither tier made Claude a true consumer *or* producer in the Agentspan ecosystem

**Goal:** One clean architecture where Claude agents are first-class Agentspan citizens — able to call any registered Agentspan tool, spawn real Conductor sub-workflows, and be invoked by any other Agentspan workflow — with full fine-grained observability throughout.

---

## Architecture Overview

Claude CLI runs **natively** via `claude_agent_sdk`. The integration point is an **in-process MCP server** (`AgentspanMcpServer`) that bridges the Conductor ecosystem to Claude without touching the SDK's transport layer.

```
Conductor Worker Node
│
├── Claude CLI (claude_agent_sdk — runs unmodified)
│   │
│   ├── Built-in tools: Bash, Read, Write, Glob, Grep, WebSearch, WebFetch
│   │     ├── execute locally (speed — no Conductor overhead)
│   │     └── PreToolUse/PostToolUse hooks → push events to Agentspan server
│   │
│   └── MCP server: "agentspan"  (in-process, zero network hop)
│         ├── @tool functions     → Conductor SIMPLE tasks on remote workers
│         ├── spawn_subagent      → Conductor SUB_WORKFLOW (another Claude run)
│         └── spawn_<name>        → named-agent Conductor workflow
│
└── Conductor SDK client (dispatches tasks, polls results)
          ├── Tool workers (any language, any machine)
          └── Subagent workflows (linked parent → child)
```

**What this gives us:**

| Capability | How |
|---|---|
| Claude calls any Agentspan `@tool` | Auto-discovered via MCP |
| Claude spawns Conductor sub-workflows | `spawn_subagent` / `spawn_<name>` MCP tools |
| Any workflow calls Claude | Claude = Conductor SIMPLE task worker |
| Built-in tool observability | Hooks → events (non-blocking) |
| Ecosystem tool observability | MCP server emits events + Conductor task ID |
| Session durability | Native SDK `resume` + Agentspan session API |
| Permissions | `can_use_tool` callback + `allowed_tools` / `disallowed_tools` |
| No hook timeout | MCP calls block indefinitely (unlike hook IPC ~60s) |

---

## Component 1: AgentspanMcpServer

The core new piece. Created once per worker at startup; lives in-process for the worker's lifetime.

### Tool Discovery

At construction, reads the Agentspan tool registry (same source as Conductor worker registration) and builds an MCP tool for every registered `@tool` function. Tool schema is derived from Python type annotations and docstring. No manual registration needed — the ecosystem is auto-discoverable.

### Tool Naming

MCP protocol prefixes tools as `mcp__<server>__<tool_name>`. Server name is `"agentspan"`.

```
@tool def echo_data(msg: str) → Claude calls mcp__agentspan__echo_data
@tool def run_query(sql: str) → Claude calls mcp__agentspan__run_query
```

### Conductor Dispatch (per tool call)

1. Locate the registered Conductor task definition for the tool
2. Start a minimal single-task workflow (or call existing task directly)
3. Poll until `COMPLETED` / `FAILED` — **no timeout**, MCP calls block indefinitely
4. Return `output["result"]` to Claude
5. Emit `tool_call` event before dispatch, `tool_result` event after

### Subagent Dispatch (`spawn_subagent`)

1. Start the same `_fw_claude_<agent_name>` workflow with `{"prompt": "...", "_is_subagent": true}`
2. `_is_subagent: true` in task input disables MCP ecosystem on the child (prevents infinite recursion)
3. Poll until complete — no timeout
4. Emit `subagent_start` (with both workflow IDs) before dispatch, `subagent_stop` after
5. Return result string to Claude

### Named Agent Dispatch (`spawn_<name>`)

Same as subagent dispatch but targets a specific pre-registered workflow definition. Enables Claude to invoke a LangGraph graph, OpenAI agent, or any other Agentspan agent by name.

### In-Process Implementation

Uses `claude_agent_sdk`'s `McpSdkServerConfig` / `SdkMcpTool` primitives to register an in-process MCP server. Passed to `ClaudeAgentOptions` as:

```python
mcp_servers={"agentspan": McpSdkServerConfig(tools=[...])}
```

---

## Component 2: Updated `ClaudeCodeAgent`

The 3-tier complexity collapses into clean orthogonal flags.

```python
@dataclass
class ClaudeCodeAgent:
    # Core (unchanged)
    name: str = "claude_agent"
    cwd: str = "."
    allowed_tools: List[str] = field(default_factory=list)
    disallowed_tools: List[str] = field(default_factory=list)   # newly exposed
    max_turns: int = 100
    model: str = "claude-opus-4-6"
    max_tokens: int = 8192
    system_prompt: Optional[str] = None

    # Ecosystem integration
    conductor_subagents: bool = False   # spawn_subagent MCP tool → Conductor SUB_WORKFLOWs
    mcp_ecosystem: bool = False         # expose all @tool functions as MCP tools
    agents: Dict[str, AgentDefinition] = field(default_factory=dict)  # named agents

    # Permissions (newly exposed from SDK)
    permission_mode: Optional[str] = None  # "auto-edit"|"accept-edits"|"bypass-permissions"

    # Deprecated (kept one release, then removed)
    # agentspan_routing: bool  → use mcp_ecosystem=True
    # subagent_overrides: dict → use agents={} instead
    # conductor_subagents semantics change: was hook-based, now MCP-based
```

**Flag semantics:**

- `conductor_subagents=True`: adds `spawn_subagent` MCP tool. Claude's Agent tool is removed from `allowed_tools` (system prompt guides Claude to use `spawn_subagent` instead).
- `mcp_ecosystem=True`: all `@tool` functions auto-discovered and exposed via MCP. Can be used independently of `conductor_subagents`.
- `agents`: each entry `{"researcher": AgentDefinition(...)}` registers a `spawn_researcher` MCP tool that starts the named Conductor workflow.

---

## Component 3: Updated `make_claude_worker`

The worker factory builds `AgentspanMcpServer` when needed and wires it into `ClaudeAgentOptions`.

**Worker construction flow:**

```
make_claude_worker(agent_obj, name, server_url, auth_key, auth_secret)
  │
  ├── if mcp_ecosystem or conductor_subagents:
  │     build AgentspanMcpServer(
  │       tools=discover_tools() if mcp_ecosystem else [],
  │       subagent_workflow=name if conductor_subagents else None,
  │       named_agents=agent_obj.agents,
  │       conductor_client=_ConductorSubagentClient(...),
  │       event_client=_AgentspanEventClient(...),
  │     )
  │
  └── tool_worker(task):
        restore session
        build hooks (PreToolUse, PostToolUse, SubagentStart, SubagentStop)
        build ClaudeAgentOptions(
          allowed_tools=...,
          disallowed_tools=...,
          mcp_servers={"agentspan": mcp_server} if mcp_server else {},
          hooks=hooks,
          resume=session_id,
          can_use_tool=permission_callback if permission_mode else None,
          permission_mode=agent_obj.permission_mode,
        )
        async for msg in query(prompt, options): ...
        checkpoint session on completion
```

**`_is_subagent` flag:** When a task has `input["_is_subagent"] = True`, `mcp_ecosystem` and `conductor_subagents` are both treated as `False` for that execution — MCP server is not created, preventing recursive subagent spawning.

---

## Observability Event Schema

Single unified event channel. `source` field distinguishes built-in vs ecosystem.

```jsonc
// Built-in tool (from SDK hook)
{"type": "tool_call",   "source": "builtin", "toolName": "Bash",      "args": {"command": "echo hi"}}
{"type": "tool_result", "source": "builtin", "toolName": "Bash",      "result": "hi\n"}

// Ecosystem tool via MCP (from AgentspanMcpServer)
{"type": "tool_call",   "source": "mcp", "toolName": "echo_tool",
 "conductorTaskId": "abc-123", "args": {"message": "world"}}
{"type": "tool_result", "source": "mcp", "toolName": "echo_tool",
 "conductorTaskId": "abc-123", "result": "echo:world"}

// Subagent lifecycle
{"type": "subagent_start", "subWorkflowId": "xyz-789",
 "parentWorkflowId": "main-456", "prompt": "Say: done"}
{"type": "subagent_stop",  "subWorkflowId": "xyz-789",
 "parentWorkflowId": "main-456", "result": "done"}
```

`conductorTaskId` in MCP events enables the Agentspan UI to deep-link to the Conductor task. `parentWorkflowId` in subagent events creates an explicit parent→child link between workflows.

---

## Session Management

No change from current Tier 1. The SDK's native session system is the right model:

1. Before run: `GET /api/agent-sessions/{workflowId}` → if found, `resume=session_id` in options
2. On `SystemMessage(subtype="init")`: capture `session_id`
3. After each tool (`PostToolUse` hook): find JSONL file, `POST /api/agent-sessions/{workflowId}`
4. On worker crash + retry: session auto-restored from Agentspan server

---

## Permission Model

Three layers, applied in order:

1. **`allowed_tools` / `disallowed_tools`**: coarse SDK-level gates (unchanged)
2. **`permission_mode`**: SDK-level mode (`"auto-edit"`, `"accept-edits"`, `"bypass-permissions"`)
3. **`can_use_tool` callback**: dynamic per-call check — can consult Agentspan permission registry, user roles, etc. Returns `PermissionResultAllow` or `PermissionResultDeny(reason="...")`

---

## Testing Strategy

### Layer 1 — Unit Tests (no Conductor, no Claude CLI)

`AgentspanMcpServer`:
- Discovers `@tool` functions and generates correct MCP tool schemas
- Dispatches tool call → creates Conductor task (mocked client)
- Returns Conductor task output to caller
- Emits `tool_call` / `tool_result` events around dispatch
- `spawn_subagent` → creates SUB_WORKFLOW with `_is_subagent: true`
- `spawn_<name>` → creates named workflow

Edge cases:
- `@tool` raises exception → MCP returns error (no crash)
- Conductor task `FAILED` → MCP returns error string
- Empty tool registry → server starts with zero ecosystem tools (valid)
- MCP tool name collision with built-in tool name
- `_is_subagent=True` in task input → MCP server not created
- `spawn_subagent` called when `conductor_subagents=False` → clear error

Session management:
- Restore reads JSONL from Agentspan server, writes to disk, returns `session_id`
- Checkpoint finds JSONL, POSTs to Agentspan server
- Restore 404 → returns `None`, worker starts fresh (not an error)
- JSONL file missing at checkpoint → logs warning, continues

Hooks:
- `PreToolUse` emits `tool_call` event with correct payload
- `PostToolUse` emits `tool_result` event + triggers checkpoint
- Hook failure is non-fatal (events are fire-and-forget)

Permissions:
- `can_use_tool` allow → `PermissionResultAllow`
- `can_use_tool` deny → `PermissionResultDeny` with reason

### Layer 2 — Integration Tests (real Conductor, mocked `query()`)

Mock `claude_agent_sdk.query` to emit predetermined tool-use sequences. Verify the infrastructure responds correctly without needing a real LLM.

Key scenarios:
- `@tool` registered → appears in MCP tool list → Conductor task created on call
- `spawn_subagent` → SUB_WORKFLOW created, linked by `parentWorkflowId`
- Session restore → `resume=session_id` passed into SDK options
- Worker "crash" + retry → session restored from checkpoint
- Parallel MCP tool calls in one turn (two tools requested simultaneously)

### Layer 3 — E2E Test (real Claude, real Conductor, target <30s)

One deterministic agent that exercises every integration path in a single run. System prompt forces specific tool calls in order — Claude's non-determinism is irrelevant to test assertions.

```python
@tool
def echo_tool(message: str) -> str:
    """Return message prefixed with 'echo:'."""
    return f"echo:{message}"

agent = ClaudeCodeAgent(
    name="e2e_test",
    cwd="/tmp",
    allowed_tools=["Bash"],
    conductor_subagents=True,
    mcp_ecosystem=True,
    max_turns=6,
    system_prompt="""Complete these four steps in order, then stop:
    1. Run bash: echo built-in
    2. Call mcp__agentspan__echo_tool with message="ecosystem"
    3. Use spawn_subagent with prompt: "Reply only with: subagent-done"
    4. Reply with exactly: DONE|<bash-result>|<echo-result>|<subagent-result>
    """,
)
```

Assertions (none depend on what Claude says):
```python
assert result.status == "COMPLETED"

events = get_events(result.workflow_id)
types = {e["type"] for e in events}
assert {"tool_call", "tool_result", "subagent_start", "subagent_stop"} <= types

# echo_tool ran as real Conductor task
tasks = conductor.get_tasks(result.workflow_id)  # or child workflow tasks
echo_task = next(t for t in tasks if t["taskDefName"] == "echo_tool")
assert echo_task["status"] == "COMPLETED"
assert echo_task["outputData"]["result"] == "echo:ecosystem"

# subagent is a linked Conductor workflow
subagent_evt = next(e for e in events if e["type"] == "subagent_start")
sub_wf = conductor.get_workflow(subagent_evt["subWorkflowId"])
assert sub_wf["status"] == "COMPLETED"
```

### Implementation Order

1. Unit tests for `AgentspanMcpServer` → implement server
2. Unit tests for session management → verify existing code (minimal changes)
3. Unit tests for hooks → verify existing hook code
4. Integration tests with mocked `query()` → wire into `make_claude_worker`
5. E2E test → runs last, catches wiring issues the above tests missed

---

## Files Changed

| File | Change |
|---|---|
| `frameworks/claude_mcp_server.py` | **New** — `AgentspanMcpServer` class |
| `frameworks/claude.py` | Update `ClaudeCodeAgent` fields; update `make_claude_worker` to build MCP server and pass to SDK |
| `frameworks/claude_transport.py` | **Deprecated** — keep for one release, remove after |
| `runtime/runtime.py` | Minor: `_is_subagent` already in place; `thread_count` fix already in place |
| `tests/unit/test_claude_mcp_server.py` | **New** — Layer 1 unit tests |
| `tests/unit/test_claude_worker.py` | Update existing tests for new API |
| `tests/integration/test_claude_mcp_integration.py` | **New** — Layer 2 integration tests |
| `examples/claude/test_e2e_mcp.py` | **New** — Layer 3 E2E test |
