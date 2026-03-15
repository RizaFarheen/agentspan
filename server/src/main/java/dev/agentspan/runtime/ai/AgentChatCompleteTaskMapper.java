/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.ai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.conductoross.conductor.ai.models.ChatCompletion;
import org.conductoross.conductor.ai.models.ChatMessage;
import org.conductoross.conductor.ai.models.LLMResponse;
import org.conductoross.conductor.ai.models.Media;
import org.conductoross.conductor.ai.models.ToolCall;
import org.conductoross.conductor.ai.tasks.mapper.AIModelTaskMapper;
import org.conductoross.conductor.config.AIIntegrationEnabledCondition;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Primary;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.netflix.conductor.model.TaskModel;
import com.netflix.conductor.model.WorkflowModel;

import com.netflix.conductor.core.exception.TerminateWorkflowException;
import com.netflix.conductor.core.execution.mapper.TaskMapperContext;

import lombok.extern.slf4j.Slf4j;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_HTTP;
import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_SIMPLE;
import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_SUB_WORKFLOW;

/**
 * Custom override of Conductor's ChatCompleteTaskMapper that properly
 * handles SUB_WORKFLOW task results in the conversation history.
 *
 * <p>The upstream mapper puts raw SUB_WORKFLOW metadata (subWorkflowDefinition,
 * workflowInput, etc.) into tool messages instead of extracting the actual
 * result. This causes the coordinator LLM to see garbage tool results,
 * especially in scatter-gather patterns with many parallel sub-agents.</p>
 *
 * <p>This mapper fixes the SUB_WORKFLOW handling to:</p>
 * <ul>
 *   <li>Extract clean input from the original tool call arguments</li>
 *   <li>Extract just the {@code result} field from SUB_WORKFLOW output</li>
 *   <li>Avoid duplicate tool_call/tool entries from direct SUB_WORKFLOW
 *       iteration since the LLM toolCalls path already covers them</li>
 * </ul>
 */
@Component
@Primary
@Order(Ordered.HIGHEST_PRECEDENCE)
@Conditional(AIIntegrationEnabledCondition.class)
@Slf4j
public class AgentChatCompleteTaskMapper extends AIModelTaskMapper<ChatCompletion> {

    private static final Set<String> TOOL_TASK_TYPES =
            Set.of(TASK_TYPE_HTTP, TASK_TYPE_SIMPLE, "MCP", "CALL_MCP_TOOL");

    public AgentChatCompleteTaskMapper() {
        super(ChatCompletion.NAME);
    }

    @Override
    protected TaskModel getMappedTask(TaskMapperContext taskMapperContext)
            throws TerminateWorkflowException {
        // Call AIModelTaskMapper.getMappedTask() to create the base TaskModel
        // (skips ChatCompleteTaskMapper's broken getHistory)
        TaskModel taskModel = super.getMappedTask(taskMapperContext);
        WorkflowModel workflowModel = taskMapperContext.getWorkflowModel();

        try {
            ChatCompletion chatCompletion =
                    objectMapper.convertValue(taskModel.getInputData(), ChatCompletion.class);
            List<ChatMessage> history = chatCompletion.getMessages();
            if (chatCompletion.getUserInput() != null && chatCompletion.getMessages().isEmpty()) {
                history.add(new ChatMessage(ChatMessage.Role.user, chatCompletion.getUserInput()));
            }
            getHistory(workflowModel, taskModel, chatCompletion);
            updateTaskModel(chatCompletion, taskModel);
        } catch (Exception e) {
            if (e instanceof TerminateWorkflowException) {
                throw (TerminateWorkflowException) e;
            } else {
                log.error("input: {}", taskModel.getInputData());
                log.error(e.getMessage(), e);
                throw new TerminateWorkflowException(
                        String.format(
                                "Error preparing chat completion task input: %s", e.getMessage()));
            }
        }
        return taskModel;
    }

    private void updateTaskModel(ChatCompletion chatCompletion, TaskModel simpleTask) {
        Map<String, Object> paramReplacement = chatCompletion.getPromptVariables();
        if (paramReplacement == null) {
            paramReplacement = new HashMap<>();
        }
        List<ChatMessage> messages = chatCompletion.getMessages();
        if (messages == null) {
            messages = new ArrayList<>();
        }
        for (ChatMessage message : messages) {
            String msgText = message.getMessage();
            if (msgText != null) {
                msgText = org.conductoross.conductor.common.utils.StringTemplate.fString(
                        msgText, paramReplacement);
                message.setMessage(msgText);
            }
        }
        simpleTask.getInputData().put("messages", messages);
        simpleTask.getInputData().put("tools", chatCompletion.getTools());
    }

    /**
     * Build conversation history from completed tasks in the workflow.
     *
     * <p>This is a fixed version of the upstream ChatCompleteTaskMapper's
     * private getHistory method. The key changes:</p>
     * <ul>
     *   <li>SUB_WORKFLOW tasks encountered directly are skipped (they're
     *       handled via the LLM toolCalls path to avoid duplicates)</li>
     *   <li>When resolving tool results for SUB_WORKFLOW tasks via toolCalls,
     *       the result is extracted cleanly from outputData.result instead of
     *       sending raw metadata</li>
     * </ul>
     */
    private void getHistory(
            WorkflowModel workflow, TaskModel chatCompleteTask, ChatCompletion chatCompletion) {

        Map<String, List<TaskModel>> refNameToTask = new HashMap<>();
        for (TaskModel task : workflow.getTasks()) {
            refNameToTask
                    .computeIfAbsent(
                            task.getWorkflowTask().getTaskReferenceName(), k -> new ArrayList<>())
                    .add(task);
        }

        String historyContextTaskRefName =
                chatCompleteTask.getWorkflowTask().getTaskReferenceName();
        if (chatCompleteTask.getParentTaskReferenceName() != null) {
            historyContextTaskRefName = chatCompleteTask.getParentTaskReferenceName();
        }

        List<ChatMessage> history = new ArrayList<>();

        for (TaskModel task : workflow.getTasks()) {
            if (!task.getStatus().isTerminal()) {
                continue;
            }

            boolean skipTask = true;
            ChatMessage.Role role = ChatMessage.Role.assistant;

            if (task.getParentTaskReferenceName() != null
                    && task.getParentTaskReferenceName().equals(historyContextTaskRefName)) {
                skipTask = false;
            } else if (task.isLoopOverTask()
                    && task.getWorkflowTask()
                            .getTaskReferenceName()
                            .equals(historyContextTaskRefName)) {
                skipTask = false;
            } else if (chatCompletion.getParticipants() != null) {
                ChatMessage.Role participantRole =
                        chatCompletion
                                .getParticipants()
                                .get(task.getWorkflowTask().getTaskReferenceName());
                if (participantRole != null) {
                    role = participantRole;
                    skipTask = false;
                }
            }

            if (skipTask) {
                continue;
            }

            log.trace(
                    "\nTask {} - {} will be used for history",
                    task.getReferenceTaskName(),
                    task.getTaskType());

            LLMResponse response = null;
            try {
                response = objectMapper.convertValue(task.getOutputData(), LLMResponse.class);
            } catch (Exception ignore) {
                response = LLMResponse.builder().result(task.getOutputData()).build();
            }

            if (TOOL_TASK_TYPES.contains(task.getWorkflowTask().getType())) {
                // SIMPLE/HTTP/MCP tool — keep original behavior
                ToolCall toolCall =
                        ToolCall.builder()
                                .inputParameters(task.getInputData())
                                .name(task.getTaskDefName())
                                .taskReferenceName(task.getReferenceTaskName())
                                .type(task.getTaskType())
                                .output(task.getOutputData())
                                .build();
                history.add(new ChatMessage(ChatMessage.Role.tool, toolCall));

            } else if (TASK_TYPE_SUB_WORKFLOW.equals(task.getWorkflowTask().getType())) {
                // SUB_WORKFLOW — skip direct entries. These are handled via
                // the LLM toolCalls path below, which has the original tool call
                // context and avoids sending raw sub-workflow metadata.
                log.trace("Skipping direct SUB_WORKFLOW entry for {} — handled via toolCalls path",
                        task.getReferenceTaskName());

            } else if (response.getToolCalls() != null && !response.getToolCalls().isEmpty()) {
                // LLM task with toolCalls — look up executed tasks and build
                // ONE assistant message with ALL tool calls, then individual
                // tool response messages. This matches the OpenAI API format
                // where one assistant message contains all parallel tool calls.
                List<ToolCall> assistantToolCalls = new ArrayList<>();
                List<ChatMessage> toolResponses = new ArrayList<>();

                for (ToolCall toolCall : response.getToolCalls()) {
                    String toolRefName = toolCall.getTaskReferenceName();
                    List<TaskModel> toolModels =
                            refNameToTask.getOrDefault(toolRefName, new ArrayList<>());
                    for (TaskModel toolModel : toolModels) {
                        if (toolModel.getStatus().isTerminal()
                                && toolModel.getStatus().isSuccessful()) {
                            assistantToolCalls.add(toolCall);

                            // For SUB_WORKFLOW tasks, extract clean result
                            Map<String, Object> toolOutput = toolModel.getOutputData();
                            Map<String, Object> toolInput = toolModel.getInputData();

                            if (TASK_TYPE_SUB_WORKFLOW.equals(toolModel.getTaskType())) {
                                toolOutput = extractSubWorkflowResult(toolOutput);
                                toolInput = extractSubWorkflowInput(toolInput);
                            }

                            ToolCall toolCallResult =
                                    ToolCall.builder()
                                            .inputParameters(toolInput)
                                            .name(toolModel.getTaskDefName())
                                            .taskReferenceName(
                                                    toolModel.getWorkflowTask()
                                                            .getTaskReferenceName())
                                            .type(toolModel.getTaskType())
                                            .output(toolOutput)
                                            .build();
                            toolResponses.add(new ChatMessage(ChatMessage.Role.tool, toolCallResult));
                        }
                    }
                }

                // Emit ONE assistant message with all tool calls, then all responses
                if (!assistantToolCalls.isEmpty()) {
                    ChatMessage assistantMsg = new ChatMessage();
                    assistantMsg.setRole(ChatMessage.Role.tool_call);
                    assistantMsg.setToolCalls(assistantToolCalls);
                    history.add(assistantMsg);
                    history.addAll(toolResponses);
                }

            } else {
                // Other tasks — assistant messages, etc.
                if (response.getResult() != null) {
                    Object resultObj = response.getResult();
                    if (resultObj instanceof Map<?, ?>) {
                        if (((Map<?, ?>) resultObj).containsKey("response")) {
                            resultObj = ((Map<?, ?>) resultObj).get("response");
                        }
                    }
                    var msg = new ChatMessage(role, String.valueOf(resultObj));
                    if (response.getMedia() != null) {
                        msg.setMedia(response.getMedia().stream().map(Media::getLocation).toList());
                    }
                    history.add(msg);
                }
            }
        }
        chatCompletion.getMessages().addAll(history);
    }

    /**
     * Extract clean result from SUB_WORKFLOW output.
     * SUB_WORKFLOW outputData = {subWorkflowId, result, finishReason, rejectionReason}
     * We extract just {result: "the actual text"}.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractSubWorkflowResult(Map<String, Object> outputData) {
        if (outputData == null) {
            return Map.of("result", "");
        }
        Object result = outputData.get("result");
        if (result != null) {
            return Map.of("result", result);
        }
        return outputData;
    }

    /**
     * Extract clean input from SUB_WORKFLOW input.
     * SUB_WORKFLOW inputData = {subWorkflowDefinition, workflowInput: {prompt, session_id}, ...}
     * We extract just the workflowInput (the actual arguments).
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractSubWorkflowInput(Map<String, Object> inputData) {
        if (inputData == null) {
            return Map.of();
        }
        Object workflowInput = inputData.get("workflowInput");
        if (workflowInput instanceof Map) {
            return (Map<String, Object>) workflowInput;
        }
        Map<String, Object> clean = new HashMap<>(inputData);
        clean.remove("subWorkflowDefinition");
        return clean;
    }
}
