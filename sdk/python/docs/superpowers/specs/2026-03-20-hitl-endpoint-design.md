# HITL Endpoint Design

**Date:** 2026-03-20
**Status:** Approved
**Scope:** Java Spring Boot server (`dev.agentspan.runtime`)

---

## Overview

Add a Human-in-the-Loop (HITL) registry to the agentspan server so the UI can discover all running workflows that are paused waiting for human input, render a form using the task's embedded JSON Schema and UI Schema, and submit the human response.

---

## Background

The agentspan runtime already supports HITL via Conductor's `HUMAN` task type. When a workflow requires human input (tool approval, guardrail review, or manual agent selection), the workflow pauses and a `HUMAN` task enters `IN_PROGRESS` status. Each such task carries:

- `response_schema` — JSON Schema describing the required human response
- `response_ui_schema` — UI Schema with widget hints for form rendering
- `__humanTaskDefinition` — Conductor metadata including a human-readable `displayName`
- Context fields — `tool_calls`, `guardrail_message`, `agent_options`, `conversation`, etc.

Currently there is no API to list all workflows waiting for human input. This design adds that missing capability.

**Constraint: one HUMAN task per workflow at a time.** The agentspan workflow structure (sequential LLM loop with SwitchTask routing) guarantees that at most one HUMAN task is `IN_PROGRESS` for a given `workflowId` at any moment. The registry uses `workflowId` as its primary key, consistent with this guarantee.

---

## New Package

All new code lives in `dev.agentspan.runtime.hitl`. This package must be within the application's existing `@ComponentScan` base path so Spring discovers `@Component` beans automatically.

```
dev.agentspan.runtime.hitl/
├── HitlTask.java
├── HitlTaskDao.java
├── InMemoryHitlTaskDao.java
└── HitlWorkflowStatusListener.java
```

---

## Data Model

### `HitlTask`

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HitlTask {
    private String workflowId;
    private String taskId;                         // Conductor task ID — used in POST path
    private String agentName;                      // from task.getWorkflowType()
    private String displayName;                    // from __humanTaskDefinition; default: agentName
    private String taskType;                       // "tool_approval"|"guardrail_review"|"agent_selection"|"unknown"
    private Map<String, Object> responseSchema;    // JSON Schema for form validation
    private Map<String, Object> responseUiSchema;  // UI Schema for widget rendering
    private Map<String, Object> context;           // filtered domain context (see below)
    private Instant registeredAt;

    /**
     * Builds a HitlTask from a Conductor task.
     *
     * workflowId is passed explicitly rather than derived from task.getWorkflowInstanceId()
     * so the call site is unambiguous across Conductor SDK versions.
     *
     * Steps (in order):
     *  1. workflowId  ← parameter
     *  2. taskId      ← task.getTaskId()
     *  3. agentName   ← task.getWorkflowType()
     *  4. displayName ← if inputData.get("__humanTaskDefinition") instanceof Map, cast to
     *                   Map<String,Object> and get "displayName" key as String;
     *                   default to agentName if not a Map, absent, or null
     *  5. taskType    ← from FULL inputData (before any stripping); first key that is
     *                   present and non-null wins: tool_calls→"tool_approval",
     *                   guardrail_message→"guardrail_review", agent_options→"agent_selection",
     *                   else "unknown"
     *  6. responseSchema   ← (Map<String,Object>) inputData.getOrDefault("response_schema", emptyMap())
     *  7. responseUiSchema ← (Map<String,Object>) inputData.getOrDefault("response_ui_schema", emptyMap())
     *  8. context     ← new HashMap<>(inputData) with keys __humanTaskDefinition,
     *                   response_schema, response_ui_schema removed
     *  9. registeredAt ← Instant.now()
     *
     * Missing or malformed fields: log a warning, use stated defaults.
     * Do NOT throw — registration failure must not fail the Conductor task execution.
     */
    public static HitlTask fromConductorTask(Task task, String workflowId) { ... }
}
```

Lombok `@Data` generates getters, setters, `equals`, `hashCode`, `toString`. Jackson serialises `@Data` classes without additional annotations.

---

## DAO Interface

```java
public interface HitlTaskDao {
    void register(HitlTask task);

    /** Remove by workflowId. No-op if not present. */
    void removeByWorkflowId(String workflowId);

    /** Atomic lookup-and-remove by taskId. No-op if not present. */
    void removeByTaskId(String taskId);

    /** Returns tasks sorted by registeredAt ascending. Empty list if none pending. */
    List<HitlTask> listPending();

    Optional<HitlTask> findByTaskId(String taskId);
}
```

---

## `InMemoryHitlTaskDao`

Three maps kept in sync to support O(1) lookup by either key direction:

```java
@Component
@Primary
public class InMemoryHitlTaskDao implements HitlTaskDao {

    private final Map<String, HitlTask> byWorkflowId  = new HashMap<>();  // workflowId → HitlTask
    private final Map<String, String>   taskToWorkflow = new HashMap<>();  // taskId     → workflowId
    private final Map<String, String>   workflowToTask = new HashMap<>();  // workflowId → taskId

    // All methods synchronized on `this`. sort in listPending() executes inside
    // the synchronized block so the returned list reflects a consistent snapshot.

    @Override
    public synchronized void register(HitlTask task) {
        byWorkflowId.put(task.getWorkflowId(), task);
        taskToWorkflow.put(task.getTaskId(), task.getWorkflowId());
        workflowToTask.put(task.getWorkflowId(), task.getTaskId());
    }

    @Override
    public synchronized void removeByWorkflowId(String workflowId) {
        String taskId = workflowToTask.remove(workflowId);
        if (taskId != null) taskToWorkflow.remove(taskId);
        byWorkflowId.remove(workflowId);
    }

    @Override
    public synchronized void removeByTaskId(String taskId) {
        String workflowId = taskToWorkflow.remove(taskId);
        if (workflowId != null) {
            byWorkflowId.remove(workflowId);
            workflowToTask.remove(workflowId);
        }
    }

    @Override
    public synchronized List<HitlTask> listPending() {
        // sort inside synchronized block to return a consistent snapshot
        return byWorkflowId.values().stream()
            .sorted(Comparator.comparing(HitlTask::getRegisteredAt))
            .collect(toList());
    }

    @Override
    public synchronized Optional<HitlTask> findByTaskId(String taskId) {
        String workflowId = taskToWorkflow.get(taskId);
        return workflowId != null
            ? Optional.ofNullable(byWorkflowId.get(workflowId))
            : Optional.empty();
    }
}
```

Plain `HashMap` is used — all access is behind `synchronized`, so `ConcurrentHashMap` provides no additional benefit.

Future DB-backed implementation: add `@Component @Profile("db")` class implementing `HitlTaskDao`; remove `@Primary` from `InMemoryHitlTaskDao` or use `@ConditionalOnProperty`.

---

## Lifecycle: Registration & Eviction

### Register

In `AgentHumanTask.execute()`, after emitting the SSE `"waiting"` event via `AgentStreamRegistry`:

```java
hitlTaskDao.register(HitlTask.fromConductorTask(task, workflowId));
```

### Evict — New POST Endpoint

The `POST /api/agent/{taskId}` controller calls `hitlTaskDao.removeByTaskId(taskId)` on **both** `200 OK` and `404 Not Found` outcomes. On 404, Conductor does not recognise the task (already completed or never existed); `HitlTask.taskId` is always set from `task.getTaskId()` at registration (step 2 of `fromConductorTask`), so the Conductor `taskId` and registry `taskId` are the same value — evicting on 404 is correct and safe.

On `500 Internal Server Error`, eviction is **skipped** — task state is unknown. `HitlWorkflowStatusListener` handles cleanup when the workflow reaches a terminal state.

### Evict — Existing Respond Endpoint

`AgentService.respond()` (used by `POST /api/agent/{workflowId}/respond`) already receives `workflowId` as a method parameter — the path variable is passed directly from the controller. Add after the existing task-completion logic succeeds:

```java
hitlTaskDao.removeByWorkflowId(workflowId);
```

### Evict — Workflow Finalisation

```java
@Component
public class HitlWorkflowStatusListener implements WorkflowStatusListener {

    private final HitlTaskDao hitlTaskDao;

    public HitlWorkflowStatusListener(HitlTaskDao hitlTaskDao) {
        this.hitlTaskDao = hitlTaskDao;
    }

    @Override
    public void onWorkflowFinalised(Workflow workflow) {
        hitlTaskDao.removeByWorkflowId(workflow.getWorkflowId());
    }
}
```

`@Component` ensures Spring discovers and registers this bean. Conductor's Spring Boot starter auto-wires all `WorkflowStatusListener` beans. `onWorkflowFinalised` fires on all terminal workflow states: COMPLETED, FAILED, TIMED_OUT, TERMINATED.

All `removeBy*` methods are no-ops on missing keys — safe to call from multiple eviction paths for the same task.

---

## API Endpoints

Both new routes are added to the existing `AgentController` (`@RestController @RequestMapping("/api/agent")`), keeping all agent routes in one controller and ensuring Spring MVC resolves the literal `/hitl` segment before any `{taskId}` path-variable route.

### `GET /api/agent/hitl`

Returns all currently pending HITL tasks sorted by `registeredAt` ascending.

**Response:** `200 OK`, `application/json` — `List<HitlTask>`. Returns `[]` when none pending.

**Example response:**

```json
[
  {
    "workflowId": "abc-123",
    "taskId": "t-456",
    "agentName": "support_agent",
    "displayName": "Support Agent Tool Approval",
    "taskType": "tool_approval",
    "responseSchema": {
      "type": "object",
      "required": ["approved"],
      "properties": {
        "approved": { "type": "boolean", "title": "Approved" },
        "reason":   { "type": "string",  "title": "Reason" }
      }
    },
    "responseUiSchema": {
      "ui:order": ["approved", "reason"],
      "approved": { "ui:widget": "radio" },
      "reason":   { "ui:widget": "textarea" }
    },
    "context": {
      "tool_calls": [{ "tool_name": "send_email", "parameters": { "to": "user@example.com" } }]
    },
    "registeredAt": "2026-03-20T10:00:00Z"
  }
]
```

---

### `POST /api/agent/{taskId}`

Submit a human response for a specific HITL task.

> **Note on path:** Intentionally flat under `/api/agent/` (not nested under `/hitl/`), consistent with the existing agent task operation convention. Task IDs are Conductor UUIDs and do not collide with named path segments. Both new routes are on `AgentController` so Spring MVC literal-first resolution is guaranteed.

**Path param:** `taskId` — from `HitlTask.taskId` in the list response.

**Request body:** Conductor `TaskResult`

```json
{
  "taskId": "t-456",
  "workflowInstanceId": "abc-123",
  "status": "COMPLETED",
  "outputData": { "approved": true }
}
```

**HTTP Status Codes:**

| Status | Condition | Registry eviction |
|--------|-----------|-------------------|
| `200 OK` | `updateTask()` succeeded | `removeByTaskId(taskId)` called |
| `404 Not Found` | `updateTask()` throws `NotFoundException` | `removeByTaskId(taskId)` called — task is no longer pending |
| `500 Internal Server Error` | `updateTask()` throws unexpectedly | Eviction skipped — `HitlWorkflowStatusListener` cleans up on finalisation |

---

## Changes to Existing Files

| File | Change |
|------|--------|
| `AgentHumanTask.java` | Inject `HitlTaskDao`; call `register()` after SSE waiting event |
| `AgentService.java` | Inject `HitlTaskDao`; call `removeByWorkflowId()` in `respond()` |
| `AgentController.java` | Add `GET /api/agent/hitl` and `POST /api/agent/{taskId}` routes |

---

## Out of Scope

- Database-backed `HitlTaskDao` implementation (future)
- UI implementation (separate repo)
- Authentication / authorization on new endpoints

---

## Testing

**Unit — `InMemoryHitlTaskDao`:**
- `register()` populates all three maps; `removeByWorkflowId()` and `removeByTaskId()` clean all three
- `listPending()` returns tasks sorted by `registeredAt` ascending (sort is inside synchronized block)
- Double-remove (same task via `removeByWorkflowId` then `removeByTaskId`, or vice versa) is a no-op on the second call — no map entries remain
- `findByTaskId()` returns empty after removal

**Unit — `HitlTask.fromConductorTask()`:**
- Correct field extraction for each taskType: `tool_approval`, `guardrail_review`, `agent_selection`
- Falls back to `"unknown"` when none of the known keys are present in inputData
- `taskType` is derived from full inputData (key present = non-null entry in map) before context stripping
- Missing `__humanTaskDefinition` defaults `displayName` to `agentName`
- Missing `response_schema` / `response_ui_schema` defaults to empty map
- Method never throws on missing or malformed inputData

**Unit — `HitlWorkflowStatusListener`:**
- `onWorkflowFinalised(workflow)` delegates to `hitlTaskDao.removeByWorkflowId(workflow.getWorkflowId())` — verified with a mock `HitlTaskDao`

**Integration** (requires running Conductor instance):
- Start a workflow that reaches a HUMAN task → verify it appears in `GET /api/agent/hitl`
- Submit `POST /api/agent/{taskId}` with valid `TaskResult` → verify entry is removed from list and workflow advances past the HUMAN task
