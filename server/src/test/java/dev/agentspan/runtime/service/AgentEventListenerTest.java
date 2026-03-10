package dev.agentspan.runtime.service;

import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import dev.agentspan.runtime.model.AgentSSEEvent;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AgentEventListenerTest {

    private AgentStreamRegistry streamRegistry;
    private AgentEventListener listener;

    @BeforeEach
    void setUp() {
        streamRegistry = mock(AgentStreamRegistry.class);
        listener = new AgentEventListener(streamRegistry);
    }

    private TaskModel makeTask(String workflowId, String taskType, String refName) {
        TaskModel task = new TaskModel();
        task.setWorkflowInstanceId(workflowId);
        task.setTaskType(taskType);
        task.setReferenceTaskName(refName);
        return task;
    }

    private WorkflowModel makeWorkflow(String workflowId) {
        WorkflowModel wf = new WorkflowModel();
        wf.setWorkflowId(workflowId);
        return wf;
    }

    // ── onTaskScheduled ──────────────────────────────────────────────

    @Test
    void onTaskScheduled_llmEmitsThinking() {
        TaskModel task = makeTask("wf-1", "LLM_CHAT_COMPLETE", "agent_llm");

        listener.onTaskScheduled(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("thinking");
        assertThat(captor.getValue().getContent()).isEqualTo("agent_llm");
    }

    @Test
    void onTaskScheduled_subWorkflowEmitsHandoff() {
        TaskModel task = makeTask("wf-1", "SUB_WORKFLOW", "parent_support_sub");
        task.setSubWorkflowId("child-wf-1");

        listener.onTaskScheduled(task);

        // Should register alias
        verify(streamRegistry).registerAlias("child-wf-1", "wf-1");

        // Should emit handoff event
        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("handoff");
        assertThat(captor.getValue().getTarget()).isEqualTo("support");
    }

    @Test
    void onTaskScheduled_subWorkflowNoChildId_noAlias() {
        TaskModel task = makeTask("wf-1", "SUB_WORKFLOW", "agent_sub");
        task.setSubWorkflowId(null);

        listener.onTaskScheduled(task);

        verify(streamRegistry, never()).registerAlias(anyString(), anyString());
        // Should still emit handoff
        verify(streamRegistry).send(eq("wf-1"), any(AgentSSEEvent.class));
    }

    @Test
    void onTaskScheduled_humanNoEvent_handledByAgentHumanTask() {
        // HUMAN tasks are system tasks — Conductor does NOT call onTaskScheduled for them.
        // The WAITING event is emitted by AgentHumanTask.start() instead.
        TaskModel task = makeTask("wf-1", "HUMAN", "hitl_approve");
        task.setInputData(Map.of("tool_name", "publish_article", "parameters", Map.of("title", "Test")));

        listener.onTaskScheduled(task);

        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onTaskScheduled_otherTaskType_noEvent() {
        // SWITCH, INLINE, etc. should not emit any event
        TaskModel task = makeTask("wf-1", "SWITCH", "switch_task");

        listener.onTaskScheduled(task);

        verify(streamRegistry, never()).send(anyString(), any());
    }

    // ── onTaskInProgress ─────────────────────────────────────────────

    @Test
    void onTaskInProgress_noEventForAnyType() {
        // Conductor does NOT call onTaskInProgress for system tasks (HUMAN).
        // WAITING is handled by AgentHumanTask.start().
        TaskModel task = makeTask("wf-1", "HUMAN", "hitl_task");
        listener.onTaskInProgress(task);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onTaskInProgress_nonHuman_noEvent() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "search");

        listener.onTaskInProgress(task);

        verify(streamRegistry, never()).send(anyString(), any());
    }

    // ── onTaskCompleted ──────────────────────────────────────────────

    @Test
    void onTaskCompleted_toolTaskEmitsToolCallAndResult() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "search_tool");
        task.setInputData(Map.of("query", "hello"));
        task.setOutputData(Map.of("result", "found it"));

        listener.onTaskCompleted(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry, times(2)).send(eq("wf-1"), captor.capture());

        AgentSSEEvent toolCall = captor.getAllValues().get(0);
        assertThat(toolCall.getType()).isEqualTo("tool_call");
        assertThat(toolCall.getToolName()).isEqualTo("search_tool");

        AgentSSEEvent toolResult = captor.getAllValues().get(1);
        assertThat(toolResult.getType()).isEqualTo("tool_result");
        assertThat(toolResult.getResult()).isEqualTo("found it");
    }

    @Test
    void onTaskCompleted_guardrailPassEmitsGuardrailPass() {
        TaskModel task = makeTask("wf-1", "LLM_CHAT_COMPLETE", "content_guardrail");
        task.setOutputData(Map.of("passed", true));

        listener.onTaskCompleted(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("guardrail_pass");
        assertThat(captor.getValue().getGuardrailName()).isEqualTo("content_guardrail");
    }

    @Test
    void onTaskCompleted_guardrailFailEmitsGuardrailFail() {
        TaskModel task = makeTask("wf-1", "INLINE", "safety_guardrail");
        task.setOutputData(Map.of("passed", false, "message", "Unsafe content"));

        listener.onTaskCompleted(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("guardrail_fail");
        assertThat(captor.getValue().getContent()).isEqualTo("Unsafe content");
    }

    @Test
    void onTaskCompleted_systemTask_noEvent() {
        TaskModel task = makeTask("wf-1", "SWITCH", "route_task");
        task.setOutputData(Map.of("result", "value"));

        listener.onTaskCompleted(task);

        verify(streamRegistry, never()).send(anyString(), any());
    }

    // ── onTaskFailed ─────────────────────────────────────────────────

    @Test
    void onTaskFailed_emitsError() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "search_tool");
        task.setReasonForIncompletion("Connection timeout");

        listener.onTaskFailed(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("error");
        assertThat(captor.getValue().getContent()).isEqualTo("Connection timeout");
    }

    @Test
    void onTaskFailedWithTerminalError_delegatesToOnTaskFailed() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "tool");
        task.setReasonForIncompletion("Fatal error");

        listener.onTaskFailedWithTerminalError(task);

        verify(streamRegistry).send(eq("wf-1"), any(AgentSSEEvent.class));
    }

    @Test
    void onTaskTimedOut_emitsError() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "slow_tool");

        listener.onTaskTimedOut(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("error");
        assertThat(captor.getValue().getContent()).isEqualTo("Task timed out");
    }

    // ── No-op task callbacks ─────────────────────────────────────────

    @Test
    void onTaskCanceled_noEvent() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "tool");
        listener.onTaskCanceled(task);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onTaskSkipped_noEvent() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "tool");
        listener.onTaskSkipped(task);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onTaskCompletedWithErrors_delegatesToOnTaskCompleted() {
        TaskModel task = makeTask("wf-1", "SIMPLE", "search_tool");
        task.setInputData(Map.of("q", "test"));
        task.setOutputData(Map.of("result", "partial"));

        listener.onTaskCompletedWithErrors(task);

        // Should emit tool_call + tool_result
        verify(streamRegistry, times(2)).send(eq("wf-1"), any(AgentSSEEvent.class));
    }

    // ── Workflow callbacks ───────────────────────────────────────────

    @Test
    void onWorkflowCompleted_emitsDoneAndCompletes() {
        WorkflowModel wf = makeWorkflow("wf-1");
        wf.setOutput(Map.of("result", "Final answer"));

        listener.onWorkflowCompleted(wf);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("done");
        assertThat(captor.getValue().getOutput()).isEqualTo(Map.of("result", "Final answer"));
        verify(streamRegistry).complete("wf-1");
    }

    @Test
    void onWorkflowCompletedIfEnabled_emitsDoneAndCompletes() {
        WorkflowModel wf = makeWorkflow("wf-1");
        wf.setOutput(Map.of("result", "Answer"));

        listener.onWorkflowCompletedIfEnabled(wf);

        verify(streamRegistry).send(eq("wf-1"), any(AgentSSEEvent.class));
        verify(streamRegistry).complete("wf-1");
    }

    @Test
    void onWorkflowTerminated_emitsErrorAndCompletes() {
        WorkflowModel wf = makeWorkflow("wf-1");
        wf.setReasonForIncompletion("Timeout exceeded");

        listener.onWorkflowTerminated(wf);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("error");
        assertThat(captor.getValue().getContent()).isEqualTo("Timeout exceeded");
        verify(streamRegistry).complete("wf-1");
    }

    @Test
    void onWorkflowTerminated_nullReason_usesDefault() {
        WorkflowModel wf = makeWorkflow("wf-1");
        wf.setReasonForIncompletion(null);

        listener.onWorkflowTerminated(wf);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo("Workflow terminated");
    }

    @Test
    void onWorkflowTerminatedIfEnabled_emitsErrorAndCompletes() {
        WorkflowModel wf = makeWorkflow("wf-1");
        wf.setReasonForIncompletion("Error");

        listener.onWorkflowTerminatedIfEnabled(wf);

        verify(streamRegistry).send(eq("wf-1"), any(AgentSSEEvent.class));
        verify(streamRegistry).complete("wf-1");
    }

    @Test
    void onWorkflowPausedIfEnabled_emitsWaiting() {
        WorkflowModel wf = makeWorkflow("wf-1");

        listener.onWorkflowPausedIfEnabled(wf);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getType()).isEqualTo("waiting");
        assertThat(captor.getValue().getPendingTool()).isEmpty();
    }

    // ── No-op workflow callbacks ─────────────────────────────────────

    @Test
    void onWorkflowStartedIfEnabled_noEvent() {
        WorkflowModel wf = makeWorkflow("wf-1");
        listener.onWorkflowStartedIfEnabled(wf);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onWorkflowResumedIfEnabled_noEvent() {
        WorkflowModel wf = makeWorkflow("wf-1");
        listener.onWorkflowResumedIfEnabled(wf);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    @Test
    void onWorkflowFinalizedIfEnabled_noEvent() {
        WorkflowModel wf = makeWorkflow("wf-1");
        listener.onWorkflowFinalizedIfEnabled(wf);
        verify(streamRegistry, never()).send(anyString(), any());
    }

    // ── Error handling ───────────────────────────────────────────────

    @Test
    void emitSwallowsExceptions() {
        doThrow(new RuntimeException("send failed"))
                .when(streamRegistry).send(anyString(), any());

        TaskModel task = makeTask("wf-1", "LLM_CHAT_COMPLETE", "llm");

        // Should not throw
        assertThatCode(() -> listener.onTaskScheduled(task)).doesNotThrowAnyException();
    }

    // ── extractHandoffTarget ─────────────────────────────────────────

    @Test
    void onTaskScheduled_extractsHandoffTargetFromSubSuffix() {
        TaskModel task = makeTask("wf-1", "SUB_WORKFLOW", "team_engineer_sub");
        task.setSubWorkflowId("child-1");

        listener.onTaskScheduled(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        // Filter to handoff event (second call after registerAlias)
        AgentSSEEvent handoff = captor.getValue();
        assertThat(handoff.getType()).isEqualTo("handoff");
        assertThat(handoff.getTarget()).isEqualTo("engineer");
    }

    @Test
    void onTaskScheduled_extractsHandoffTargetFromSubworkflowSuffix() {
        TaskModel task = makeTask("wf-1", "SUB_WORKFLOW", "team_designer_subworkflow");
        task.setSubWorkflowId("child-2");

        listener.onTaskScheduled(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getTarget()).isEqualTo("designer");
    }

    @Test
    void onTaskScheduled_simpleRefNameAsTarget() {
        TaskModel task = makeTask("wf-1", "SUB_WORKFLOW", "assistant");
        task.setSubWorkflowId("child-3");

        listener.onTaskScheduled(task);

        ArgumentCaptor<AgentSSEEvent> captor = ArgumentCaptor.forClass(AgentSSEEvent.class);
        verify(streamRegistry).send(eq("wf-1"), captor.capture());
        assertThat(captor.getValue().getTarget()).isEqualTo("assistant");
    }
}
