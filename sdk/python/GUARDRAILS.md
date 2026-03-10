# Guardrails for AI Agents — Conceptual Analysis & SDK Review

## Context

Deep analysis of what guardrails are, why they matter, when/where they execute, and how they should be implemented for agent systems. Reviews AG2, OpenAI Agents SDK, LangGraph, CrewAI, Guardrails AI, and NVIDIA NeMo. Evaluates the Orkes Conductor Agents SDK's current guardrail implementation against the industry state-of-the-art.

---

## 1. What Are Guardrails?

Guardrails are **validation and safety boundaries** that constrain an AI agent's behavior at defined checkpoints. They are NOT just content filters — they are a fundamental architectural pattern for making agents trustworthy in production.

A guardrail answers one question: **"Should this content be allowed to proceed?"**

The answer is one of:
- **Pass** — content is acceptable, continue
- **Fail** — content violates a policy, take corrective action
- **Fix** — content has issues but can be automatically corrected

### Taxonomy of Guardrail Concerns

| Layer | What it protects | Examples |
|-------|-----------------|----------|
| **Safety** | Users from harmful content | Toxic language, self-harm, violence |
| **Security** | System from attacks | Prompt injection, jailbreaking, data exfiltration |
| **Compliance** | Organization from liability | PII leakage (SSNs, credit cards), HIPAA/GDPR violations |
| **Quality** | Users from bad output | Hallucinations, off-topic responses, format errors |
| **Policy** | Business from brand risk | Competitor mentions, unauthorized claims, tone violations |
| **Cost** | Budget from runaway usage | Token limits, loop guards, expensive tool call prevention |

---

## 2. Why Guardrails Matter for Agents (Not Just LLMs)

For a single LLM call, guardrails are useful. For **agents**, they are **essential**. Here's why:

### Agents amplify risk through autonomy
- Agents make multi-step decisions without human oversight
- Each tool call is an **action** (not just text) — sending emails, writing to databases, making API calls
- A single bad decision can cascade through tool chains
- An agent running for 25 turns with tools has exponentially more surface area than a single prompt/response

### The "Swiss cheese model" applies
Like aviation safety, no single guardrail catches everything. Effective agent safety requires **defense in depth** — multiple guardrails at multiple checkpoints, where the holes in one layer are covered by the next.

### Agents have unique attack surfaces
| Surface | LLM risk | Agent risk (amplified) |
|---------|----------|----------------------|
| Prompt injection | LLM follows injected instructions | Agent executes injected tool calls |
| Data exfiltration | LLM mentions sensitive data | Agent sends sensitive data via tools |
| Hallucination | Wrong text response | Agent takes wrong actions based on hallucinated reasoning |
| Loop exploitation | N/A | Agent stuck in infinite tool-call loop, burning tokens |

---

## 3. When & Where Guardrails Execute (The Five Checkpoints)

The agent execution loop has **five natural checkpoints** where guardrails can intercept:

```
User Input
    |
    v
+-------------------+
| 1. INPUT RAILS    | <-- Validate user prompt before any processing
+--------+----------+
         |
    +----v----+
    | LLM Call| <--- 2. PRE-MODEL RAILS (modify/validate prompt to LLM)
    +----+----+
         |
    +----v-----------+
    | 3. POST-MODEL   | <-- Validate LLM response (before tool execution)
    |    RAILS        |
    +----+-----------+
         |
    +----v-----------+
    | Tool Execution  | <--- 4. TOOL RAILS (validate tool inputs/outputs)
    +----+-----------+
         |
    (loop back to LLM or...)
         |
    +----v-----------+
    | 5. OUTPUT RAILS | <-- Validate final response before returning to user
    +----+-----------+
         |
         v
    User Response
```

### Checkpoint details

| # | Checkpoint | When | What it catches | Cost of failure |
|---|-----------|------|-----------------|-----------------|
| 1 | **Input** | Before agent loop starts | Prompt injection, malformed input, off-topic requests | Low (no work done yet) |
| 2 | **Pre-model** | Before each LLM call in the loop | Conversation context poisoning, accumulated injection | Medium |
| 3 | **Post-model** | After LLM responds, before tool dispatch | Hallucinated tool calls, unsafe reasoning | High (about to act) |
| 4 | **Tool** | Around each tool execution | Dangerous parameters, sensitive data in args/results | Critical (action taken) |
| 5 | **Output** | Before returning final answer to user | PII in response, policy violations, quality issues | Medium (no action, just text) |

### The key insight: Checkpoint 3 and 4 are the most critical for agents

Most SDKs only implement checkpoints 1 and 5 (input/output). But for agents, the highest risk is at checkpoints 3 (the LLM decided to call a dangerous tool) and 4 (the tool is about to execute with bad parameters). This is where **tool guardrails** come in — a concept only OpenAI and LangGraph have properly addressed.

---

## 4. How Guardrails Work — Failure Modes

When a guardrail fails, the system must decide what to do. The industry has converged on five patterns:

### 4a. Tripwire (OpenAI pattern)
```
Guardrail fails -> Raise exception -> Halt execution entirely
```
- **Best for**: Security violations, compliance hard stops
- **Trade-off**: No recovery, but guaranteed safety
- **OpenAI calls this**: `tripwire_triggered = True`

### 4b. Retry with feedback (Orkes/CrewAI pattern)
```
Guardrail fails -> Append feedback to prompt -> Re-run LLM
```
- **Best for**: Quality issues, format problems, soft policy violations
- **Trade-off**: Costs extra tokens, but LLM can self-correct
- **Our SDK does this**: Append `"[Previous response was rejected: {feedback}]"` and retry

### 4c. Route/redirect (AG2 pattern)
```
Guardrail fails -> Route to specialized handler agent
```
- **Best for**: Multi-agent systems where a "safety agent" can handle violations
- **Trade-off**: More complex orchestration
- **AG2 calls this**: "traffic light" with activation message + target agent

### 4d. Fix/modify (Guardrails AI pattern)
```
Guardrail fails -> Auto-correct the content -> Continue with fixed version
```
- **Best for**: Deterministic fixes (redact PII, fix JSON format)
- **Trade-off**: May alter meaning, but fast and non-disruptive
- **Guardrails AI does this**: `on_fail=OnFailAction.FIX`

### 4e. Human escalation
```
Guardrail fails -> Pause execution -> Wait for human review
```
- **Best for**: High-stakes decisions, ambiguous violations
- **Trade-off**: Blocks execution, requires human availability
- **Orkes advantage**: Conductor's HumanTask makes this trivial

---

## 5. How the Industry Does It — SDK Comparison

### OpenAI Agents SDK
**Key innovation: Parallel execution + tripwire**
- Guardrails can run **concurrently with the LLM** (default) — optimizes latency
- Or **blocking mode** — prevents token waste if guardrail will fail
- Tripwire pattern: binary pass/fail, raises typed exception
- Three positions: input, output, and **tool guardrails** (unique)
- Guardrail function receives full `context + agent + input/output` — rich context

**Strength**: Execution control (parallel vs blocking) is a genuine innovation
**Weakness**: Only tripwire failure mode (no retry/fix)

### AG2 (AutoGen)
**Key innovation: Route-to-agent pattern**
- Guardrails are event-driven, fit the actor model
- When triggered, redirects conversation to a specialized agent
- Two types: regex (fast/deterministic) and LLM (semantic)
- "Activation message" concept — custom message shown when guardrail triggers

**Strength**: Multi-agent routing is natural for multi-agent frameworks
**Weakness**: No retry or fix modes, only redirect

### LangGraph / LangChain
**Key innovation: Middleware hooks at 5 lifecycle points**
- `before_agent`, `after_agent`, `before_model`, `after_model`, `wrap_tool_call`
- Familiar middleware pattern from web frameworks
- Class-based middleware can carry state across hooks
- Built-in PII detection with multiple strategies (redact, mask, hash, block)

**Strength**: Most flexible — hooks at every point in the lifecycle
**Weakness**: No opinionated guardrail type system — too low-level

### CrewAI
**Key innovation: Hallucination guardrail**
- 5-step validation: context comparison -> faithfulness scoring -> verdict -> threshold -> feedback
- Task-level integration (guardrails on tasks, not agents)
- Generates detailed feedback with scoring for retry

**Strength**: Domain-specific guardrail types (hallucination detection is genuinely useful)
**Weakness**: Limited to output position, no input/tool guardrails

### Guardrails AI (standalone library)
**Key innovation: Composable validator pipeline**
- `Guard().use(Validator1(), Validator2(), ...)` — chain validators
- Pre-built validator hub (100+ validators)
- Four failure modes: exception, fix, retry, custom handler
- Each validator is independent, reusable, testable

**Strength**: Best composability model — validators are true building blocks
**Weakness**: Not agent-aware — doesn't understand tools, loops, or handoffs

### NVIDIA NeMo Guardrails
**Key innovation: Domain-specific language (Colang)**
- Dedicated programming language for defining guardrail flows
- Five rail types: input, retrieval, dialog, execution, output
- Event-driven state machine
- Dialog rails control conversation flow (unique)

**Strength**: Most expressive — can model complex conversational guardrail logic
**Weakness**: High learning curve, another language to maintain

### Comparison Table

| Aspect | OpenAI | AG2 | LangGraph | CrewAI | Guardrails AI | NeMo |
|--------|--------|-----|-----------|--------|---------------|------|
| **Architecture** | Parallel/Blocking modes | Event-driven actors | Middleware hooks | Task-level | Composable validators | Flow-based DSL |
| **Input Guardrails** | Yes (blocking/parallel) | Yes (pre-agent) | Before hooks | Limited | Yes (Guard wrapper) | Yes (input rails) |
| **Output Guardrails** | Yes (explicit) | Yes (post-agent) | After hooks | Yes (task-level) | Yes (Guard wrapper) | Yes (output rails) |
| **Tool Guardrails** | Yes (explicit) | Limited | Wrap hooks | Tool call hooks | Limited | Execution rails |
| **Failure Mode** | Tripwire exception | Message routing | Raise/Modify | Retry/Error | on_fail policies | Event blocking |
| **Composability** | Sequential | Dual-mechanism | Middleware chaining | Per-task | Validator chaining | Flow composition |
| **Unique Feature** | Parallel mode | Agent routing | Middleware patterns | Hallucination guard | Validator hub | Colang DSL |

---

## 6. Our Current Implementation — Honest Assessment

### What we have today

| Aspect | Current State | Assessment |
|--------|--------------|------------|
| **Input guardrails** | Client-side, pre-workflow, raise-only | Functional but limited |
| **Output guardrails** | Client-side, post-workflow, retry/raise | Functional but wasteful |
| **Tool guardrails** | Not implemented | **Gap** |
| **Guardrail types** | Guardrail, RegexGuardrail, LLMGuardrail + `@guardrail` decorator | Good coverage |
| **Failure modes** | retry, raise, fix, human (`OnFail` enum) | ~~Missing: fix, tripwire, redirect, human~~ Implemented |
| **Composability** | None (sequential list only) | **Gap** vs Guardrails AI |
| **Execution model** | Sequential, client-side | Missing: parallel, server-side |
| **Durability** | Not durable (client-side) | **Fundamental gap** for Conductor |
| **In-loop integration** | Not compiled into workflow | `compile_guardrail_tasks()` exists but unused |
| **Retry limit** | Hardcoded 3 | Should be configurable |
| **Streaming support** | None | `stream()` skips guardrails |
| **Fire-and-forget** | `start()` skips guardrails | **Gap** |

### The fundamental architectural issue

Our guardrails run **client-side in the Python process**, but our key differentiator is **server-side durable execution via Conductor**. This means:

1. If the client crashes after the workflow completes but before guardrail checking, guardrails are skipped
2. Guardrails are invisible in the Conductor UI (no task, no status, no logs)
3. Output guardrail retry re-submits the **entire workflow** instead of repeating just the LLM call inside the DoWhile loop
4. `start()` (fire-and-forget) and `stream()` can't run output guardrails at all

The `compile_guardrail_tasks()` method in `agent_compiler.py` was clearly the intended design — compile guardrails as worker tasks inside the workflow — but it was never wired in.

### What we do well

1. **Three guardrail types** (custom, regex, LLM) — matches industry standard
2. **Retry with feedback** — genuinely useful, most SDKs only have tripwire/halt
3. **Position-based** (input/output) — clean API
4. **`on_fail` parameter** — configurable failure behavior per guardrail
5. **GuardrailResult with message** — feedback flows back to LLM for self-correction

---

## 7. Gaps & Recommendations

### Tier 1: Critical gaps (should fix)

**7a. Compile output guardrails into the DoWhile loop**
- Output guardrails should be worker tasks INSIDE the agent loop
- After the LLM responds and before the next iteration, check guardrails
- If guardrail fails with `retry`: append feedback to messages and continue the loop (no full re-execution)
- If guardrail fails with `raise`: terminate the workflow with an error
- This makes guardrails **durable** and **visible in Conductor UI**
- The `compile_guardrail_tasks()` method is the starting point

**7b. Add tool guardrails (Checkpoint 4)**
- Allow `@tool(guardrails=[...])` or a new `ToolGuardrail` type
- Validate tool inputs before execution (e.g., block SQL injection in query params)
- Validate tool outputs after execution (e.g., redact PII from API responses)
- This is the highest-risk checkpoint for agents and only OpenAI/LangGraph address it

**7c. Make retry limit configurable**
- `Guardrail(func, on_fail="retry", max_retries=5)`
- Currently hardcoded to 3 in runtime.py

### Tier 2: Important enhancements

**7d. Add `on_fail="fix"` mode**
- Guardrail returns corrected content instead of just pass/fail
- `GuardrailResult(passed=False, message="...", fixed_output="corrected text")`
- Runtime uses `fixed_output` instead of retrying — faster, cheaper
- Useful for deterministic corrections (PII redaction, format fixing)

**7e. Add `on_fail="human"` mode**
- Guardrail failure pauses workflow via Conductor HumanTask
- Human reviews and approves/rejects/edits
- Natural fit for Conductor's existing human-in-the-loop support
- Major differentiator — no other SDK has durable human escalation for guardrails

**7f. Composable guardrails with `&` / `|`**
- `guardrail_a & guardrail_b` -> both must pass
- `guardrail_a | guardrail_b` -> either can pass
- Same pattern as our TerminationCondition composability

**7g. Support guardrails in `start()` and `stream()`**
- Since guardrails will be compiled into the workflow, they'll automatically work with all execution modes
- This is a natural consequence of fixing 7a

### Tier 3: Nice-to-have

**7h. Parallel execution mode (OpenAI-style)**
- Run guardrails concurrently with the LLM call
- If guardrail fails, cancel/discard the LLM response
- Optimization for latency-sensitive applications

**7i. Built-in guardrail types**
- `PromptInjectionGuardrail` — detect common injection patterns
- `PIIGuardrail` — detect PII with multiple strategies (block, redact, mask)
- `HallucinationGuardrail` — fact-check against provided context (CrewAI-style)
- `ToxicityGuardrail` — content safety classification

**7j. Guardrail metrics/observability**
- Track pass/fail rates per guardrail
- Track retry counts and costs
- Surface in Conductor UI dashboard

---

## 8. Recommended Architecture

```
User Input
    |
    v
[Input Guardrails]          <-- Client-side (fast, pre-workflow)
    |                          Positions: "input"
    |                          Modes: raise, human
    v
+-- DoWhile Loop ------------------------------------------+
|                                                          |
|   [LLM Call]                                            |
|       |                                                  |
|       v                                                  |
|   [Output Guardrails]     <-- Server-side worker tasks  |
|       |                      Positions: "output"         |
|       |                      Modes: retry, raise, fix,   |
|       |                              human               |
|       v                                                  |
|   [Tool Dispatch]                                       |
|       |                                                  |
|       v                                                  |
|   [Tool Guardrails]       <-- Server-side, per-tool     |
|       |                      Positions: "tool_input",    |
|       |                                 "tool_output"    |
|       v                                                  |
|   (next iteration or exit)                              |
|                                                          |
+----------------------------------------------------------+
    |
    v
Final Output
```

### Key architectural decisions
1. **Input guardrails stay client-side** — they run once, before the workflow, and don't need durability
2. **Output guardrails compile into the DoWhile loop** — durable, visible, efficient retry
3. **Tool guardrails are new** — wrap individual tool executions, highest-risk checkpoint
4. **`on_fail="human"`** leverages Conductor's HumanTask — unique differentiator
5. **`on_fail="fix"`** enables auto-correction without retry — faster and cheaper
