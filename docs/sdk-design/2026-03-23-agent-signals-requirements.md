# Agent Signals — Requirements Specification

**Date:** 2026-03-23
**Status:** Draft — Under Review
**Author:** Viren + Claude

---

## 1. Problem Statement

Agentspan agents run as durable workflows that can execute for minutes to hours. Today, once an agent starts, the only external interactions are:
- **HITL** — human approves/rejects a tool call (blocking, one-shot)
- **Cancel** — abort the entire workflow
- **Pause/Resume** — freeze/unfreeze execution

There is no mechanism for **providing new context, redirecting priorities, or coordinating between concurrent agents** while they're running. This is a fundamental gap — real teams don't work in isolation. Team members interrupt each other constantly with new information, changing priorities, and course corrections.

### What's missing

| Scenario | What happens today | What should happen |
|---|---|---|
| Manager realizes research team is going down the wrong path | Wait for completion, then re-run | Manager signals team mid-execution to redirect |
| Security scan finds a vulnerability while coding agent works | Coding agent finishes unaware | Security agent signals coding agent with findings |
| User provides additional context after starting a long agent | Cancel and restart with new prompt | Signal the running agent with the new context |
| Agent A discovers information that Agent B needs | Agent B finishes without it | Agent A signals Agent B with the discovery |
| Monitoring agent detects cost overrun | Agent keeps burning tokens | Monitor signals agent to wrap up or reduce scope |

---

## 2. Use Cases

### UC-1: Human provides additional context to running agent

**Actor:** Human user
**Trigger:** User realizes they forgot to mention something, or circumstances changed since the agent started.

**Flow:**
1. User starts a long-running research agent
2. 10 minutes later, user learns that the client only cares about one specific subtopic
3. User sends a signal to the running agent: "Focus only on quantum error correction, not the broader field"
4. Agent incorporates the new context on its next LLM iteration
5. Agent adjusts its research accordingly without restarting

**Priority:** Normal (non-urgent — agent picks it up naturally)

### UC-2: Supervisor agent redirects a worker agent

**Actor:** Supervisor agent (running concurrently)
**Trigger:** Supervisor observes worker going off-track or has new strategic direction.

**Flow:**
1. Research team (Agent A) is running a multi-stage research pipeline
2. Supervisor agent (Agent X) periodically checks Agent A's progress via status/events
3. Supervisor determines Agent A is spending too much time on background research
4. Supervisor signals Agent A: "Skip background section, move directly to analysis"
5. Agent A receives the signal and adjusts its approach

**Priority:** Normal or Urgent depending on criticality

### UC-3: Agent-to-agent coordination (discovery sharing)

**Actor:** Agent B (peer agent running concurrently)
**Trigger:** Agent B discovers information relevant to Agent A's work.

**Flow:**
1. Agent A is writing a technical report
2. Agent B (running separately) is doing code review and discovers a critical bug
3. Agent B signals Agent A: "Critical bug found in auth module — include in your report"
4. Agent A incorporates the finding into its report

**Priority:** Normal

### UC-4: Urgent redirect (requirements change)

**Actor:** Human or agent
**Trigger:** Fundamental change in requirements that makes current work invalid.

**Flow:**
1. Coding agent is implementing Feature X
2. Product manager (human or PM agent) decides Feature X is cancelled, Feature Y is urgent
3. PM sends urgent signal: "Stop Feature X. Switch to Feature Y immediately."
4. Agent's current work pauses, it acknowledges the interrupt, and pivots

**Priority:** Urgent (should take effect before agent's next action)

### UC-5: Cost/safety guardrail agent interrupts

**Actor:** Monitoring agent
**Trigger:** Token budget exceeded, safety concern detected, or rate limit approaching.

**Flow:**
1. Research agent is running with a token budget of 100K
2. Monitoring agent tracks token usage across all running agents
3. At 80K tokens, monitor signals: "You've used 80% of your budget. Wrap up your current task and produce final output."
4. Research agent starts summarizing rather than continuing research

**Priority:** Urgent

### UC-6: Multi-agent pipeline with feedback loop

**Actor:** Downstream agent
**Trigger:** Downstream agent in a pipeline needs upstream agent to redo or augment its work.

**Flow:**
1. Pipeline: Researcher >> Writer >> Editor
2. Editor (stage 3) finds that Researcher's output is missing key data
3. Editor signals Researcher: "Missing data on market size. Please research and provide."
4. Researcher receives signal, does additional research, updates its output
5. Writer and Editor re-process with enriched data

**Priority:** Normal (but requires the upstream agent to still be reachable)

### UC-7: Broadcast signal to multiple agents

**Actor:** Human or coordinating agent
**Trigger:** Information relevant to multiple running agents simultaneously.

**Flow:**
1. Three agents are working in parallel on different aspects of a project
2. A policy change is announced that affects all of them
3. Coordinator sends one signal that reaches all three agents
4. Each agent incorporates the policy change independently

**Priority:** Normal

### UC-8: Signal with structured data (not just text)

**Actor:** Any agent or human
**Trigger:** Need to provide structured information, not just a natural language message.

**Flow:**
1. Agent A is calling an API with endpoint v1
2. Infrastructure agent detects that v1 is deprecated and v2 is available
3. Signal includes: `{"message": "API migrated", "data": {"old_url": "v1/...", "new_url": "v2/...", "migration_notes": "..."}}`
4. Agent A's tools can read the structured data, not just the message

---

## 3. Functional Requirements

### FR-1: Send Signal

**FR-1.1:** A signal can be sent to any running workflow by its workflow ID.

**FR-1.2:** A signal consists of:
- `message` (string, required) — natural language context for the LLM
- `data` (dict, optional) — structured data accessible to tools via ToolContext or workflow variables
- `priority` (enum, required) — `normal` or `urgent`
- `sender` (string, optional) — identifier of the sending agent/user (for attribution)

**FR-1.3:** Signals can be sent from:
- Python SDK: `runtime.signal(workflow_id, ...)`
- REST API: `POST /agent/{workflowId}/signal`
- Another agent's tool: `@tool` that calls `runtime.signal(...)`
- Any process, any machine (same as HITL)

**FR-1.4:** Sending a signal to a completed/failed/terminated workflow returns an error (not silently ignored).

**FR-1.5:** Multiple signals can be sent to the same workflow. They queue in order.

### FR-2: Normal Priority Signal

**FR-2.1:** A normal signal is injected into the workflow's conversation context as a system message.

**FR-2.2:** The agent sees the message on its **next LLM iteration** (after current tool call or LLM call completes).

**FR-2.3:** Normal signals do NOT pause or interrupt the current task. The workflow continues uninterrupted.

**FR-2.4:** If multiple normal signals arrive between LLM iterations, they are all included (concatenated or as separate messages).

**FR-2.5:** The LLM message format should clearly indicate this is an external signal, not a user message:
```
[Signal from {sender}]: {message}
```

### FR-3: Urgent Priority Signal

**FR-3.1:** An urgent signal causes the workflow to **pause after the current task completes** (not mid-task).

**FR-3.2:** The signal message is injected into conversation context.

**FR-3.3:** The workflow **auto-resumes** after injection (unlike HITL which waits for human response).

**FR-3.4:** The net effect: the agent sees the urgent message **before its next action**, with minimal delay.

**FR-3.5:** If the workflow is already paused (e.g., waiting for HITL), the urgent signal is queued and delivered when the workflow resumes.

**FR-3.6:** Urgent signals should NOT cancel or undo in-progress tool executions. The current tool completes, then the signal takes effect.

### FR-4: Signal Delivery Guarantees

**FR-4.1:** Signals are **at-least-once** delivery. A signal will be delivered even if the server restarts (durability).

**FR-4.2:** Signals are delivered in **FIFO order** per workflow (first signal sent = first signal delivered).

**FR-4.3:** Signal delivery is **asynchronous** — the sender does not block waiting for the receiver to process.

**FR-4.4:** A signal acknowledgment is returned to the sender confirming the signal was queued (not that it was processed).

**FR-4.5:** If a workflow completes between signal send and delivery, the signal is discarded (no error — race condition is acceptable).

### FR-5: Signal Visibility

**FR-5.1:** Signals appear in the workflow's event stream (SSE) as a new event type: `signal_received`.

**FR-5.2:** The signal event includes: sender, message, priority, timestamp.

**FR-5.3:** Signals are visible in the workflow execution history (Conductor UI).

**FR-5.4:** Signals are included in `AgentResult.events` after workflow completion.

### FR-6: Agent-to-Agent Signaling

**FR-6.1:** An agent can signal another agent via a tool:
```python
@tool
def signal_agent(workflow_id: str, message: str) -> dict:
    """Send a signal to another running agent."""
    runtime.signal(workflow_id, message=message, priority="normal")
    return {"status": "signal_sent"}
```

**FR-6.2:** The `workflow_id` of other agents must be discoverable. Options:
- Passed as input to the signaling agent
- Looked up via `runtime.list_executions()` or agent name
- Shared via ToolContext.state or workflow variables

**FR-6.3:** An agent can signal itself (e.g., a sub-agent signals its parent, or a scheduled check signals the main workflow).

### FR-7: Broadcast Signal

**FR-7.1:** A broadcast signal can be sent to multiple workflows at once:
```python
runtime.broadcast(workflow_ids=[wf1, wf2, wf3], message="Policy update: ...")
```

**FR-7.2:** Broadcast is equivalent to sending the same signal to each workflow individually.

**FR-7.3:** Broadcast returns per-workflow acknowledgment (some may succeed while others fail if already completed).

### FR-8: Signal in Streaming

**FR-8.1:** When a client is streaming events from a workflow, signal events appear inline in the stream.

**FR-8.2:** The `signal_received` event type is added to the SSE stream.

**FR-8.3:** Streaming clients can see signals in real-time, even if the agent hasn't processed them yet.

---

## 4. Non-Functional Requirements

### NFR-1: Latency

**NFR-1.1:** Normal signal delivery: message available to agent within **1 second** of being sent (not counting agent's current task duration).

**NFR-1.2:** Urgent signal delivery: workflow paused within **2 seconds** of current task completion.

**NFR-1.3:** Signal send API response: **< 100ms** (async — just queue the signal).

### NFR-2: Durability

**NFR-2.1:** Signals survive server restarts (stored durably, not just in-memory).

**NFR-2.2:** Signals survive process crashes of the sending agent.

### NFR-3: Scalability

**NFR-3.1:** A workflow can receive up to **100 signals** without degradation.

**NFR-3.2:** Signal delivery should not significantly impact workflow execution performance (< 5% overhead).

### NFR-4: Security

**NFR-4.1:** Signal sending requires the same authentication as other API operations (API key or JWT).

**NFR-4.2:** A signal sender does NOT need to be the workflow owner (any authenticated user can signal any workflow they have access to — same as HITL).

**NFR-4.3:** Signal content is not encrypted beyond transport-level TLS (same as other API payloads).

### NFR-5: Observability

**NFR-5.1:** Signal send/receive is logged on the server.

**NFR-5.2:** Signal count per workflow is trackable.

**NFR-5.3:** Signal latency (send → agent sees it) is measurable.

---

## 5. Edge Cases & Failure Modes

### EC-1: Signal to completed workflow
**Behavior:** Return error `WorkflowCompletedError("Workflow {id} is already completed")`

### EC-2: Signal to non-existent workflow
**Behavior:** Return error `WorkflowNotFoundError("Workflow {id} not found")`

### EC-3: Signal to paused workflow (HITL waiting)
**Behavior:** Queue the signal. Deliver when workflow resumes after HITL response.

### EC-4: Rapid-fire signals (100 signals in 1 second)
**Behavior:** All queued, all delivered in order. May be batched into fewer LLM messages to avoid context overflow.

### EC-5: Signal with very large data payload (1MB+)
**Behavior:** Reject with `PayloadTooLargeError`. Max signal payload: 64KB.

### EC-6: Signal during workflow compilation (before execution starts)
**Behavior:** Queue the signal. Deliver after first LLM iteration begins.

### EC-7: Agent signals itself
**Behavior:** Allowed. Useful for deferred self-reminders or sub-agent → parent communication.

### EC-8: Circular signaling (A signals B, B signals A, infinite loop)
**Behavior:** No framework-level prevention. Agents are responsible for avoiding infinite loops (same as tool call loops — the `max_turns` limit applies).

### EC-9: Signal arrives right as workflow completes
**Behavior:** Race condition — signal may or may not be delivered. Sender receives success (signal was queued). No error.

### EC-10: Signal to a sub-workflow within a parent workflow
**Behavior:** Signals target workflow IDs, not agent names. Sub-workflows have their own IDs and can be signaled independently.

---

## 6. API Surface (Proposed)

### Python SDK

```python
# Send a signal
runtime.signal(
    workflow_id="uuid-...",
    message="Focus on error correction, not the broader field",
    data={"priority_topic": "quantum error correction"},   # optional
    priority="normal",                                      # "normal" | "urgent"
    sender="supervisor_agent",                              # optional attribution
)

# Broadcast to multiple workflows
runtime.broadcast(
    workflow_ids=["uuid-1", "uuid-2", "uuid-3"],
    message="Policy update: all reports must include citations",
    priority="normal",
)

# From a tool (agent-to-agent)
@tool
def redirect_research(workflow_id: str, new_focus: str) -> dict:
    """Redirect a running research agent to a new focus area."""
    runtime.signal(workflow_id, message=f"Redirect: focus on {new_focus}", priority="urgent")
    return {"status": "redirected"}

# From AgentHandle
handle = runtime.start(agent, "Do research")
# ... later ...
handle.signal("Additional context: the deadline moved to Friday")
```

### REST API

```
POST /agent/{workflowId}/signal
Content-Type: application/json

{
  "message": "Focus on error correction",
  "data": {"priority_topic": "quantum error correction"},
  "priority": "normal",
  "sender": "supervisor_agent"
}

Response: 202 Accepted
{
  "signalId": "uuid-...",
  "workflowId": "uuid-...",
  "status": "queued"
}
```

### SSE Event

```
event: signal_received
id: 42
data: {"type":"signal_received","workflowId":"...","message":"Focus on error correction","sender":"supervisor_agent","priority":"normal","timestamp":1234567890}
```

### AgentResult

```python
result = runtime.run(agent, "...")
for event in result.events:
    if event.type == "signal_received":
        print(f"Signal from {event.sender}: {event.message}")
```

---

## 7. Interaction with Existing Features

### Signals + HITL
- HITL pauses workflow and waits for human response
- Signal does NOT satisfy a pending HITL (they're different mechanisms)
- Normal signal during HITL: queued, delivered after HITL resolves
- Urgent signal during HITL: queued, delivered after HITL resolves (can't double-pause)

### Signals + Streaming
- Signal events appear in SSE stream as `signal_received`
- Clients see signals in real-time
- `AgentStream` exposes signals alongside other events

### Signals + Guardrails
- Signals bypass guardrails (they're injected as system messages, not agent output)
- A signal cannot trigger a guardrail failure

### Signals + Termination Conditions
- Signals do not affect termination conditions directly
- However, the LLM may decide to terminate based on signal content (e.g., "stop and summarize")

### Signals + Sub-workflows
- Each sub-workflow has its own workflow ID and can be signaled independently
- Signaling a parent workflow does NOT propagate to sub-workflows (explicit targeting required)
- To signal "the whole team," use broadcast with all workflow IDs

### Signals + Callbacks
- A new callback position could be added: `on_signal_received(message, data, sender, priority)`
- Callback can modify/filter the signal before it reaches the LLM
- Callback can trigger side effects (logging, alerting, forwarding)

---

## 8. Out of Scope (for v1)

| Feature | Reason |
|---|---|
| **Signal acknowledgment by receiver** | Adds complexity. Sender gets "queued" confirmation, not "processed." |
| **Signal priority levels beyond normal/urgent** | Two levels cover 95% of use cases. More can be added later. |
| **Signal-based control flow** (conditional branching) | Signals provide context, not control. Agent decides how to respond. |
| **Signal encryption** (end-to-end) | Transport-level TLS is sufficient for v1. |
| **Signal rate limiting** (per sender) | Use standard API rate limiting. No signal-specific limits. |
| **Signal filtering/routing rules** | All signals reach the agent. Agent decides relevance via LLM. |
| **Signal channels/topics** | Single signal queue per workflow. Topics add unnecessary complexity for v1. |
| **Persistent signal history** (queryable) | Signals are in workflow events. No separate signal store. |
| **Signal subscriptions** (agent subscribes to topics) | Pub/sub is v2. V1 is point-to-point + broadcast. |

---

## 9. Success Criteria

1. A human can send a signal to a running agent and see the agent incorporate it on its next LLM iteration
2. An agent can signal another concurrent agent via a tool
3. Urgent signals take effect before the agent's next action (after current task completes)
4. Signals are durable — survive server restarts
5. Signals appear in the SSE event stream and workflow execution history
6. Broadcast sends one signal to multiple workflows
7. The feature works across processes and machines (same as HITL)
8. Existing features (HITL, guardrails, streaming, termination) continue to work unchanged

---

## 10. Decisions (Resolved)

**Q1: Signal TTL** — **No TTL.** Signals are durable and permanent. They are always delivered. The agent will see them on its next LLM iteration. If the signal is "stale" by then, the LLM is smart enough to discard irrelevant context. Simplifies implementation — no expiry tracking needed.

**Q2: Pull model** — **No.** Push-only is sufficient. Signals are injected into conversation context automatically. No `get_pending_signals()` tool needed.

**Q3: Built-in `signal_tool()`** — **Yes.** Provide a built-in `signal_tool()` (like `human_tool()`) so any agent can signal other agents without writing custom tool code:
```python
from agentspan.agents import signal_tool

sig = signal_tool(
    name="signal_team",
    description="Send a signal to another running agent to provide context or redirect.",
)

supervisor = Agent(tools=[sig], ...)
```

**Q4: Sub-workflow propagation** — **Yes.** Signaling a parent workflow propagates to all active sub-workflows. This matches how real teams work — when a manager announces something, the whole team hears it.

**Q5: Message role** — **`user` role.** Signals are injected as user-role messages with a clear prefix:
```
[Signal from {sender}]: {message}
```
Rationale: `user` role messages are universally handled well across all LLM providers. `system` role has inconsistent handling (some models ignore late system messages, some treat them differently). The `[Signal from ...]` prefix clearly distinguishes signals from actual user messages, so the LLM won't confuse them.

**Q6: Signal by agent name** — **Yes.** Support signaling by agent name with optional search criteria, not just workflow ID:
```python
# By workflow ID (exact)
runtime.signal(workflow_id="uuid-...", message="...")

# By agent name (latest running execution)
runtime.signal(agent_name="researcher", message="...")

# By agent name + criteria (specific execution)
runtime.signal(agent_name="researcher", correlation_id="project-42", message="...")
runtime.signal(agent_name="researcher", session_id="user-session-7", message="...")
```
The server resolves the agent name to workflow ID(s) via search. If multiple matches, signals ALL matching running workflows (broadcast behavior). If no matches, returns error.

**Q7: Context condensation** — **Summarize with other messages.** Signals are regular conversation messages. When context condensation triggers, old signals are summarized along with everything else. The condensation LLM preserves the key information from signals as it does with any other message.

---

## 11. Additional Requirements (from decisions)

### FR-9: Built-in signal_tool()

**FR-9.1:** Provide `signal_tool()` constructor that creates a tool for agent-to-agent signaling:
```python
signal_tool(name="signal_agent", description="Signal another running agent")
```

**FR-9.2:** The tool's input schema:
```json
{
  "type": "object",
  "properties": {
    "target": {"type": "string", "description": "Workflow ID or agent name of the target"},
    "message": {"type": "string", "description": "Message to send"},
    "priority": {"type": "string", "enum": ["normal", "urgent"], "default": "normal"}
  },
  "required": ["target", "message"]
}
```

**FR-9.3:** The tool resolves `target` as workflow ID first, then falls back to agent name search.

**FR-9.4:** The tool executes server-side (like `http_tool`) — no worker needed.

### FR-10: Signal by Agent Name

**FR-10.1:** The signal API accepts `agent_name` as an alternative to `workflow_id`.

**FR-10.2:** Server resolves agent name to running workflow(s) by searching:
- Workflow type = agent_name
- Status = RUNNING
- Optionally filtered by `correlation_id` or `session_id`

**FR-10.3:** If multiple running workflows match, the signal is sent to ALL of them (broadcast).

**FR-10.4:** If no running workflows match, return error `NoRunningWorkflowError("No running workflows found for agent '{name}'")`

### FR-11: Sub-workflow Signal Propagation

**FR-11.1:** When a signal is sent to a parent workflow, the server identifies all active sub-workflows (SUB_WORKFLOW tasks in RUNNING state).

**FR-11.2:** The signal is forwarded to each active sub-workflow with the same message, data, and priority.

**FR-11.3:** Sub-workflow propagation is recursive — if a sub-workflow has its own sub-workflows, they receive the signal too.

**FR-11.4:** The propagation is best-effort — if a sub-workflow completes before the signal reaches it, no error.

**FR-11.5:** To signal ONLY the parent (no propagation), a `propagate=false` option can be set:
```python
runtime.signal(workflow_id="...", message="...", propagate=False)
```

### Updated API Surface

```python
# By workflow ID
runtime.signal(workflow_id="uuid-...", message="...", priority="normal")

# By agent name (all running instances)
runtime.signal(agent_name="researcher", message="...")

# By agent name + criteria
runtime.signal(agent_name="researcher", correlation_id="project-42", message="...")
runtime.signal(agent_name="researcher", session_id="user-session-7", message="...")

# From AgentHandle
handle.signal("Additional context: deadline moved to Friday")
handle.signal("STOP — requirements changed", priority="urgent")

# Without sub-workflow propagation
runtime.signal(workflow_id="...", message="...", propagate=False)

# Built-in signal tool (for agent-to-agent)
from agentspan.agents import signal_tool
sig = signal_tool(name="notify_team", description="Notify another agent")
agent = Agent(tools=[sig], ...)
```

### Updated REST API

```
POST /agent/{workflowId}/signal
POST /agent/signal?agentName=researcher&correlationId=project-42

{
  "message": "Focus on error correction",
  "data": {"priority_topic": "quantum error correction"},
  "priority": "normal",
  "sender": "supervisor_agent",
  "propagate": true
}
```
