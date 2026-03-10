package dev.agentspan.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netflix.conductor.common.metadata.tasks.TaskDef;
import com.netflix.conductor.common.metadata.workflow.StartWorkflowRequest;
import com.netflix.conductor.common.metadata.workflow.WorkflowDef;
import com.netflix.conductor.common.metadata.tasks.Task;
import com.netflix.conductor.common.metadata.tasks.TaskResult;
import com.netflix.conductor.common.run.Workflow;
import com.netflix.conductor.core.execution.StartWorkflowInput;
import com.netflix.conductor.core.execution.WorkflowExecutor;
import com.netflix.conductor.dao.MetadataDAO;
import com.netflix.conductor.service.ExecutionService;
import com.netflix.conductor.service.WorkflowService;

import dev.agentspan.runtime.compiler.AgentCompiler;
import dev.agentspan.runtime.model.*;
import dev.agentspan.runtime.normalizer.NormalizerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.RequiredArgsConstructor;

import java.util.*;

@Component
@RequiredArgsConstructor
public class AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final AgentCompiler agentCompiler;
    private final NormalizerRegistry normalizerRegistry;
    private final MetadataDAO metadataDAO;
    private final WorkflowExecutor workflowExecutor;
    private final WorkflowService workflowService;
    private final AgentStreamRegistry streamRegistry;
    private final ExecutionService executionService;

    /**
     * Compile an agent config into a WorkflowDef and return it.
     * Supports both native AgentConfig and framework-specific raw configs.
     */
    @SuppressWarnings("unchecked")
    public CompileResponse compile(StartRequest request) {
        AgentConfig config = resolveConfig(request);
        log.info("Compiling agent: {}", config.getName());
        WorkflowDef def = agentCompiler.compile(config);
        Map<String, Object> defMap = MAPPER.convertValue(def, Map.class);
        return CompileResponse.builder().workflowDef(defMap).build();
    }

    /**
     * Compile, register workflow + task definitions, and start execution.
     * Supports both native AgentConfig and framework-specific raw configs.
     */
    @SuppressWarnings("unchecked")
    public StartResponse start(StartRequest request) {
        AgentConfig config = resolveConfig(request);
        log.info("Starting agent: {}", config.getName());

        // 0. Pre-register child workflows for agent_tool types
        registerAgentToolWorkflows(config);

        // 1. Compile
        WorkflowDef def = agentCompiler.compile(config);

        // 1b. Stamp SDK metadata on the workflow definition
        String sdk = request.getFramework() != null ? request.getFramework() : "conductor";
        Map<String, Object> metadata = def.getMetadata() != null
                ? new LinkedHashMap<>(def.getMetadata()) : new LinkedHashMap<>();
        metadata.put("agent_sdk", sdk);
        def.setMetadata(metadata);

        // 2. Register workflow definition (upsert)
        metadataDAO.updateWorkflowDef(def);

        // 3. Register task definitions for worker tools
        registerTaskDefinitions(config);

        // 4. Start workflow execution
        StartWorkflowRequest startReq = new StartWorkflowRequest();
        startReq.setName(def.getName());
        startReq.setVersion(def.getVersion());
        startReq.setWorkflowDef(def);

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("prompt", request.getPrompt());
        input.put("media", request.getMedia() != null ? request.getMedia() : List.of());
        input.put("session_id", request.getSessionId() != null ? request.getSessionId() : "");
        startReq.setInput(input);

        if (request.getIdempotencyKey() != null) {
            startReq.setIdempotencyKey(request.getIdempotencyKey());
        }

        String workflowId = workflowExecutor.startWorkflow(new StartWorkflowInput(startReq));
        log.info("Started workflow: {} (id={})", def.getName(), workflowId);

        return StartResponse.builder()
            .workflowId(workflowId)
            .workflowName(def.getName())
            .build();
    }

    /**
     * Walk the agent tree and register task definitions for all worker tools.
     */
    private void registerTaskDefinitions(AgentConfig config) {
        Set<String> registered = new HashSet<>();
        collectAndRegisterTasks(config, registered);
    }

    private void collectAndRegisterTasks(AgentConfig config, Set<String> registered) {
        // Register dispatch task for this agent's tools
        if (config.getTools() != null) {
            for (ToolConfig tool : config.getTools()) {
                if ("worker".equals(tool.getToolType()) && !registered.contains(tool.getName())) {
                    registerTaskDef(tool.getName());
                    registered.add(tool.getName());
                }
            }
        }

        // Register stop_when worker
        if (config.getStopWhen() != null && config.getStopWhen().getTaskName() != null) {
            String taskName = config.getStopWhen().getTaskName();
            if (!registered.contains(taskName)) {
                registerTaskDef(taskName);
                registered.add(taskName);
            }
        }

        // Register custom guardrail workers
        if (config.getGuardrails() != null) {
            for (GuardrailConfig g : config.getGuardrails()) {
                if ("custom".equals(g.getGuardrailType()) && g.getTaskName() != null) {
                    if (!registered.contains(g.getTaskName())) {
                        registerTaskDef(g.getTaskName());
                        registered.add(g.getTaskName());
                    }
                }
            }
        }

        // Register callback workers
        if (config.getCallbacks() != null) {
            for (CallbackConfig cb : config.getCallbacks()) {
                if (cb.getTaskName() != null && !registered.contains(cb.getTaskName())) {
                    registerTaskDef(cb.getTaskName());
                    registered.add(cb.getTaskName());
                }
            }
        }

        // Register handoff check worker for swarm
        if (config.getHandoffs() != null && !config.getHandoffs().isEmpty()) {
            String taskName = config.getName() + "_handoff_check";
            if (!registered.contains(taskName)) {
                registerTaskDef(taskName);
                registered.add(taskName);
            }
        }

        // Register process_selection worker for manual
        if ("manual".equals(config.getStrategy())) {
            String taskName = config.getName() + "_process_selection";
            if (!registered.contains(taskName)) {
                registerTaskDef(taskName);
                registered.add(taskName);
            }
        }

        // Register check_transfer worker for hybrid
        if (config.getAgents() != null && !config.getAgents().isEmpty() &&
            config.getTools() != null && !config.getTools().isEmpty()) {
            String taskName = config.getName() + "_check_transfer";
            if (!registered.contains(taskName)) {
                registerTaskDef(taskName);
                registered.add(taskName);
            }
        }

        // Recurse into sub-agents
        if (config.getAgents() != null) {
            for (AgentConfig sub : config.getAgents()) {
                if (!sub.isExternal()) {
                    collectAndRegisterTasks(sub, registered);
                }
            }
        }
    }

    // ── Agent-as-tool workflow registration ──────────────────────

    /**
     * Pre-register child agent workflows for any agent_tool type tools.
     * Called before compilation so the enrichment script can reference
     * the child workflow by name.
     */
    @SuppressWarnings("unchecked")
    private void registerAgentToolWorkflows(AgentConfig config) {
        if (config.getTools() == null) return;

        for (ToolConfig tool : config.getTools()) {
            if (!"agent_tool".equals(tool.getToolType()) || tool.getConfig() == null) {
                continue;
            }

            Object agentConfigObj = tool.getConfig().get("agentConfig");
            if (agentConfigObj == null) continue;

            // Convert the AgentConfig (or LinkedHashMap from Jackson) to AgentConfig
            AgentConfig childConfig;
            if (agentConfigObj instanceof AgentConfig) {
                childConfig = (AgentConfig) agentConfigObj;
            } else if (agentConfigObj instanceof Map) {
                childConfig = MAPPER.convertValue(agentConfigObj, AgentConfig.class);
            } else {
                log.warn("Unexpected agentConfig type for tool '{}': {}",
                        tool.getName(), agentConfigObj.getClass());
                continue;
            }

            // Recursively register any nested agent_tool workflows
            registerAgentToolWorkflows(childConfig);

            // Compile and register the child agent workflow
            WorkflowDef childDef = agentCompiler.compile(childConfig);
            metadataDAO.updateWorkflowDef(childDef);
            log.info("Registered agent_tool child workflow: {} for tool '{}'",
                    childDef.getName(), tool.getName());

            // Register task definitions for the child's worker tools
            registerTaskDefinitions(childConfig);

            // Store the workflow name back so the enrichment script can reference it
            tool.getConfig().put("workflowName", childDef.getName());
        }

        // Also recurse into sub-agents (they might have agent_tool tools too)
        if (config.getAgents() != null) {
            for (AgentConfig sub : config.getAgents()) {
                if (!sub.isExternal()) {
                    registerAgentToolWorkflows(sub);
                }
            }
        }
    }

    // ── Config resolution ─────────────────────────────────────────

    /**
     * Resolve the AgentConfig from a StartRequest.
     * If {@code framework} is set, normalize the raw config via the appropriate normalizer.
     * Otherwise, use the native {@code agentConfig} field directly.
     */
    private AgentConfig resolveConfig(StartRequest request) {
        if (request.getFramework() != null && !request.getFramework().isEmpty()) {
            log.info("Normalizing framework '{}' agent config", request.getFramework());
            return normalizerRegistry.normalize(request.getFramework(), request.getRawConfig());
        }
        return request.getAgentConfig();
    }

    // ── SSE Streaming ──────────────────────────────────────────────

    /**
     * Open an SSE stream for a workflow. Replays missed events on reconnect.
     */
    public SseEmitter openStream(String workflowId, Long lastEventId) {
        log.info("Opening SSE stream for workflow {} (lastEventId={})", workflowId, lastEventId);
        return streamRegistry.register(workflowId, lastEventId);
    }

    /**
     * Respond to a pending HITL task in a workflow.
     */
    public void respond(String workflowId, Map<String, Object> output) {
        log.info("Responding to workflow {}: {}", workflowId, output);

        // Find the pending task (HUMAN type, IN_PROGRESS status)
        Workflow workflow = executionService.getExecutionStatus(workflowId, true);
        Task pendingTask = null;
        for (Task task : workflow.getTasks()) {
            if ("HUMAN".equals(task.getTaskType())
                    && task.getStatus() == Task.Status.IN_PROGRESS) {
                pendingTask = task;
                break;
            }
        }

        if (pendingTask == null) {
            throw new IllegalStateException(
                    "No pending HUMAN task found in workflow " + workflowId);
        }

        // Update the task with the human's response
        TaskResult taskResult = new TaskResult();
        taskResult.setTaskId(pendingTask.getTaskId());
        taskResult.setWorkflowInstanceId(workflowId);
        taskResult.setStatus(TaskResult.Status.COMPLETED);
        Map<String, Object> outputData = new LinkedHashMap<>(
                pendingTask.getOutputData() != null ? pendingTask.getOutputData() : Map.of());
        outputData.putAll(output);
        taskResult.setOutputData(outputData);
        executionService.updateTask(taskResult);
        log.info("Completed HUMAN task {} in workflow {}", pendingTask.getReferenceTaskName(), workflowId);
    }

    /**
     * Get the current status of a workflow.
     */
    public Map<String, Object> getStatus(String workflowId) {
        Workflow workflow = executionService.getExecutionStatus(workflowId, true);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workflowId", workflowId);
        result.put("status", workflow.getStatus().name());

        boolean isComplete = workflow.getStatus().isTerminal();
        result.put("isComplete", isComplete);
        result.put("isRunning", workflow.getStatus() == Workflow.WorkflowStatus.RUNNING);

        if (isComplete) {
            result.put("output", workflow.getOutput());
        }

        // Find pending HUMAN task
        for (Task task : workflow.getTasks()) {
            if ("HUMAN".equals(task.getTaskType())
                    && task.getStatus() == Task.Status.IN_PROGRESS) {
                Map<String, Object> pendingTool = new LinkedHashMap<>();
                pendingTool.put("taskRefName", task.getReferenceTaskName());
                if (task.getInputData() != null) {
                    pendingTool.put("tool_name", task.getInputData().get("tool_name"));
                    pendingTool.put("parameters", task.getInputData().get("parameters"));
                }
                result.put("pendingTool", pendingTool);
                result.put("isWaiting", true);
                break;
            }
        }

        return result;
    }

    // ── Task registration ────────────────────────────────────────────

    private void registerTaskDef(String taskName) {
        TaskDef taskDef = new TaskDef();
        taskDef.setName(taskName);
        taskDef.setRetryCount(2);
        taskDef.setRetryDelaySeconds(2);
        taskDef.setRetryLogic(TaskDef.RetryLogic.LINEAR_BACKOFF);
        taskDef.setTimeoutSeconds(120);
        taskDef.setResponseTimeoutSeconds(120);

        try {
            TaskDef existing = metadataDAO.getTaskDef(taskName);
            if (existing != null) {
                metadataDAO.updateTaskDef(taskDef);
                log.debug("Updated task definition: {}", taskName);
                return;
            }
        } catch (Exception e) {
            // Task doesn't exist, create it
        }

        metadataDAO.createTaskDef(taskDef);
        log.info("Registered task definition: {}", taskName);
    }
}
