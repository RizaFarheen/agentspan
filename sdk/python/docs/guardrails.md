# Guardrails Design

Guardrails validate agent input/output and take corrective action on failure. They compile into Conductor workflow tasks positioned before (input) or after (output) the LLM call, providing durable, server-side validation that survives process restarts.

---

## Overview

```
User Prompt
    │
    ├─ [Input Guardrails]        ← validate before LLM sees the prompt
    │
    ├─ LLM Call
    │
    ├─ [Output Guardrails]       ← validate LLM response
    │     │
    │     ├─ pass  → return result
    │     ├─ retry → feedback appended to conversation, LLM retries
    │     ├─ fix   → use corrected output, skip LLM retry
    │     ├─ raise → terminate workflow with error
    │     └─ human → pause for human review (approve/edit/reject)
    │
    └─ [Tool Guardrails]         ← validate tool inputs/outputs (Python-level)
```

---

## Guardrail Types

### Custom Function Guardrail

Write a Python function that validates content and returns `GuardrailResult`.

```python
from agentspan.agents import Guardrail, GuardrailResult, guardrail

@guardrail
def no_pii(content: str) -> GuardrailResult:
    """Reject responses containing credit card numbers."""
    if re.search(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", content):
        return GuardrailResult(
            passed=False,
            message="Contains PII. Redact all card numbers before responding.",
        )
    return GuardrailResult(passed=True)

agent = Agent(
    ...,
    guardrails=[
        Guardrail(no_pii, position="output", on_fail="retry", max_retries=3),
    ],
)
```

**Compilation:** Compiles to a Conductor **worker task**. The `@guardrail` function runs in the SDK's worker process. Multiple custom guardrails are batched into a single combined worker task — the first failure halts evaluation.

**Output path:** `${ref}.output.*` (direct).

### RegexGuardrail

Pattern-based validation. Runs entirely server-side as a JavaScript InlineTask — no Python worker needed.

```python
from agentspan.agents import RegexGuardrail, OnFail, Position

# Block mode: fail if any pattern matches (blocklist)
no_emails = RegexGuardrail(
    patterns=[r"[\w.+-]+@[\w-]+\.[\w.-]+"],
    mode="block",
    name="no_email_addresses",
    message="Response must not contain email addresses.",
    position=Position.OUTPUT,
    on_fail=OnFail.RETRY,
)

# Allow mode: fail if NO pattern matches (allowlist)
json_only = RegexGuardrail(
    patterns=[r"^\s*[\{\[]"],
    mode="allow",
    name="json_output",
    message="Response must be valid JSON.",
)
```

**Compilation:** Compiles to a Conductor **InlineTask** with JavaScript regex evaluation (GraalVM). Patterns, mode, on_fail, message, and max_retries are baked into the script at compile time.

**Output path:** `${ref}.output.result.*` (InlineTask wraps under `.result`).

### LLMGuardrail

Uses a second LLM to evaluate content against a policy. The evaluator LLM receives the policy + content and returns `{"passed": true/false, "reason": "..."}`.

```python
from agentspan.agents import LLMGuardrail

safety = LLMGuardrail(
    model="openai/gpt-4o-mini",
    policy=(
        "Reject any content that:\n"
        "1. Contains medical or legal advice presented as fact\n"
        "2. Makes promises or guarantees about outcomes\n"
        "3. Includes discriminatory or biased language"
    ),
    name="content_safety",
    position="output",
    on_fail="retry",
    max_tokens=10000,
)
```

**Compilation:** Compiles to a **LlmChatComplete** task (evaluator call) followed by an **InlineTask** (response parser). The parser extracts `passed` and `reason` from the LLM's JSON response and maps the on_fail logic.

**Output path:** `${ref}.output.result.*` (InlineTask).

**Note:** Use a fast, small model for the evaluator to avoid slowing down the agent loop.

### External Guardrail

Reference a guardrail worker running elsewhere. No local function — just the name.

```python
# Reference a guardrail deployed as a remote worker
agent = Agent(
    ...,
    guardrails=[
        Guardrail(name="compliance_check", position="output", on_fail="retry"),
    ],
)
```

**Compilation:** Compiles to a Conductor **SimpleTask** referencing the remote worker by name.

**Worker contract:**
- Input: `{"content": "<text>", "iteration": <n>}`
- Output: `{"passed": bool, "message": str, "on_fail": str, "should_continue": bool}`

**Output path:** `${ref}.output.*` (direct).

---

## Failure Modes (on_fail)

| Mode | Behavior | Use Case |
|------|----------|----------|
| `"retry"` | Feedback message appended to conversation. LLM retries with the feedback. After `max_retries` exhausted, escalates to `"raise"`. | Style issues, format corrections — let the LLM fix it. |
| `"fix"` | Uses `GuardrailResult.fixed_output` directly. No LLM retry. | Deterministic fixes (PII redaction, truncation, formatting). Faster and cheaper than retry. |
| `"raise"` | Terminates the workflow with `FAILED` status and the guardrail message. | Hard blocks — content that must never pass through. |
| `"human"` | Pauses the workflow at a HumanTask. Human can approve, edit, or reject. Only valid for `position="output"`. | Compliance review, sensitive content that needs human judgment. |

### Retry Escalation

When `on_fail="retry"` and the DoWhile loop iteration reaches `max_retries`, the guardrail automatically escalates to `"raise"`. This prevents infinite retry loops.

### Fix Mode

The `fixed_output` field in `GuardrailResult` provides the corrected output:

```python
@guardrail
def redact_phones(content: str) -> GuardrailResult:
    phone_pattern = r"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
    if re.search(phone_pattern, content):
        redacted = re.sub(phone_pattern, "[PHONE REDACTED]", content)
        return GuardrailResult(
            passed=False,
            message="Phone numbers detected and redacted.",
            fixed_output=redacted,
        )
    return GuardrailResult(passed=True)

agent = Agent(
    ...,
    guardrails=[Guardrail(redact_phones, on_fail="fix")],
)
```

### Human Mode

When `on_fail="human"`, the workflow pauses at a HumanTask. Use `start()` (async) since `run()` would block:

```python
handle = runtime.start(agent, "...")

# Poll until waiting
status = handle.get_status()
if status.is_waiting:
    runtime.approve(handle.workflow_id)    # approve as-is
    # or: runtime.reject(handle.workflow_id, "reason")
    # or: runtime.respond(handle.workflow_id, {"edited_output": "..."})
```

The human review flow compiles to:

```
HumanTask → validate → [normalize if needed] → route
  ├─ approve: continue with original output
  ├─ edit: continue with edited output
  └─ reject: terminate workflow (FAILED)
```

---

## Position: Input vs Output

| Position | When it runs | Compilation | Scope |
|----------|-------------|-------------|-------|
| `"output"` | After each LLM response, inside the DoWhile loop | Compiled as Conductor workflow tasks (durable, visible in UI) | Agent-level guardrails |
| `"input"` | Before tool execution | Python-level wrapping inside the tool worker (not a separate workflow task) | Tool-level guardrails only |

**Note:** `on_fail="human"` is only valid for `position="output"` — input guardrails run inside Python and cannot pause a workflow.

---

## Tool Guardrails

Guardrails can be attached directly to tools for pre/post-execution validation:

```python
sql_guard = Guardrail(
    no_sql_injection,
    position="input",     # check BEFORE tool executes
    on_fail="raise",      # hard block
)

@tool(guardrails=[sql_guard])
def run_query(query: str) -> str:
    """Execute a database query."""
    ...
```

Tool guardrails run inside the tool worker process (Python-level wrapping, not Conductor workflow tasks). The `make_tool_worker()` dispatch wrapper:

1. **Pre-execution** (position="input"): Serializes tool kwargs to JSON, runs guardrail check. On failure with `on_fail="raise"`, raises `ValueError`. Otherwise returns `{error: ..., blocked: True}`.

2. **Post-execution** (position="output"): Serializes tool result, runs guardrail check. On failure with `on_fail="fix"`, replaces result with `fixed_output`. With `on_fail="raise"`, raises `ValueError`.

---

## Standalone Guardrails

`@guardrail`-decorated functions are plain callables — usable without an agent or server:

```python
@guardrail
def no_pii(content: str) -> GuardrailResult:
    ...

# Call directly
result = no_pii("Some text to validate")
print(result.passed, result.message)
```

They can also be deployed as standalone Conductor workers (see example 35), allowing any agent in any language to reference them by name.

---

## Compilation Details

### Where Guardrails Appear in the Workflow

Output guardrails are compiled inside the DoWhile loop, after the LLM task:

```
DoWhile Loop
  ├─ LLM_CHAT_COMPLETE
  ├─ [Guardrail Check Task]           ← evaluates content
  ├─ [Guardrail Routing SwitchTask]   ← acts on result
  ├─ Tool Router (if agent has tools)
  └─ ...
```

### Guardrail Routing SwitchTask

After each guardrail check task, a SwitchTask routes based on `on_fail`:

```
SwitchTask
  expression: ${guardrail_ref}.output[.result].on_fail
  │
  ├─ "pass" (default): SetVariable (no-op, continue)
  │
  ├─ "retry": InlineTask formats feedback
  │    → "[Output validation failed: {message}]"
  │    → wired to LLM as user message for next iteration
  │
  ├─ "raise": TerminateTask (FAILED)
  │
  ├─ "fix": InlineTask passes fixed_output through
  │
  └─ "human": HumanTask → validate → normalize → route
       ├─ approve: continue
       ├─ edit: use edited output
       └─ reject: TerminateTask
```

### Termination Condition Integration

When output guardrails with `on_fail="retry"` exist, their `should_continue` flag is ANDed into the DoWhile termination condition:

```javascript
iteration < max_turns
  && finishReason != 'LENGTH'
  && (toolCalls != null || guardrail_should_continue)
```

This ensures the loop continues when a guardrail signals retry.

### Output Path Differences

The SwitchTask must read from different paths depending on guardrail type:

| Guardrail Type | Output Path |
|----------------|-------------|
| RegexGuardrail (InlineTask) | `$.{ref}.result.on_fail` |
| LLMGuardrail (InlineTask) | `$.{ref}.result.on_fail` |
| Custom function (Worker) | `$.{ref}.on_fail` |
| External (SimpleTask) | `$.{ref}.on_fail` |

This is tracked via the `is_inline` flag returned by `_compile_output_guardrail_tasks()`.

---

## Multi-Agent Guardrail Wrapping

When a multi-agent strategy workflow has output guardrails, the entire strategy workflow is wrapped in an outer DoWhile loop:

```
DoWhile (guardrail_loop)
  ├─ InlineSubWorkflow (strategy workflow)
  ├─ [Guardrail Check Task(s)]
  └─ [Guardrail Routing SwitchTask(s)]
```

This re-runs the full strategy workflow on retry.
