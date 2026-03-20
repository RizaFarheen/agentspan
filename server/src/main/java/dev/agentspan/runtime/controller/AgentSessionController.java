/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.controller;

import dev.agentspan.runtime.service.AgentSessionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST endpoints for Claude Agent SDK session persistence.
 * Sessions are keyed by Conductor workflowId and store the claude_agent_sdk session JSONL.
 */
@RestController
@RequestMapping("/api")
public class AgentSessionController {

    private final AgentSessionService agentSessionService;

    public AgentSessionController(AgentSessionService agentSessionService) {
        this.agentSessionService = agentSessionService;
    }

    @GetMapping("/agent-sessions/{workflowId}")
    public ResponseEntity<Map<String, String>> getSession(@PathVariable String workflowId) {
        return agentSessionService.getSession(workflowId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/agent-sessions/{workflowId}")
    public ResponseEntity<Void> saveSession(
            @PathVariable String workflowId,
            @RequestBody Map<String, String> body) {
        String sessionId = body.get("sessionId");
        String jsonlContent = body.get("jsonlContent");
        if (sessionId == null || jsonlContent == null) {
            return ResponseEntity.badRequest().build();
        }
        agentSessionService.saveSession(workflowId, sessionId, jsonlContent);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/agent-sessions/{workflowId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String workflowId) {
        agentSessionService.deleteSession(workflowId);
        return ResponseEntity.ok().build();
    }
}
