package dev.agentspan.runtime.controller;

import dev.agentspan.runtime.model.CompileResponse;
import dev.agentspan.runtime.model.StartRequest;
import dev.agentspan.runtime.model.StartResponse;
import dev.agentspan.runtime.service.AgentService;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.RequiredArgsConstructor;

import java.util.Map;

@Component
@RestController
@RequestMapping({"/api/agent"})
@RequiredArgsConstructor
public class AgentController {

    private final AgentService agentService;

    @GetMapping
    public String hello() {
        return "Hello, Agent!";
    }

    /**
     * Compile an agent configuration into a Conductor workflow definition.
     * Does not register or execute — useful for inspecting the compiled workflow.
     *
     * <p>Accepts either a native {@code AgentConfig} (as before) or a framework-specific
     * config via {@code StartRequest} with {@code framework} + {@code rawConfig} fields.</p>
     */
    @PostMapping("/compile")
    public CompileResponse compileAgent(@RequestBody StartRequest request) {
        return agentService.compile(request);
    }

    /**
     * Compile, register, and start an agent workflow execution.
     * Returns the workflow ID and name for tracking.
     */
    @PostMapping("/start")
    public StartResponse startAgent(@RequestBody StartRequest request) {
        return agentService.start(request);
    }

    /**
     * Open an SSE event stream for a running workflow.
     * Events include: thinking, tool_call, tool_result, guardrail_pass/fail,
     * waiting (HITL), handoff, error, done.
     *
     * <p>Supports reconnection via {@code Last-Event-ID} header — missed
     * events are replayed from an in-memory buffer.</p>
     */
    @GetMapping(value = "/stream/{workflowId}")
    public SseEmitter streamAgent(
            @PathVariable String workflowId,
            @RequestHeader(value = "Last-Event-ID", required = false) Long lastEventId) {
        return agentService.openStream(workflowId, lastEventId);
    }

    /**
     * Respond to a pending HITL (human-in-the-loop) task.
     * Use when a {@code waiting} SSE event is received.
     *
     * <p>Body examples:
     * <ul>
     *   <li>Approve: {@code {"approved": true}}</li>
     *   <li>Reject: {@code {"approved": false, "reason": "..."}}</li>
     *   <li>Message: {@code {"message": "..."}}</li>
     * </ul></p>
     */
    @PostMapping("/{workflowId}/respond")
    public void respondToAgent(
            @PathVariable String workflowId,
            @RequestBody Map<String, Object> output) {
        agentService.respond(workflowId, output);
    }

    /**
     * Get the current status of a workflow execution.
     * Lightweight polling fallback when SSE is not available.
     */
    @GetMapping("/{workflowId}/status")
    public Map<String, Object> getAgentStatus(@PathVariable String workflowId) {
        return agentService.getStatus(workflowId);
    }
}
