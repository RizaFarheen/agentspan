/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;

/**
 * Stores Claude Agent SDK session JSONL content server-side, keyed by Conductor workflowId.
 * Uses the filesystem at {@code agentspan.sessions.dir} (default: ~/.agentspan/sessions/).
 * One file per workflowId: {workflowId}.json containing {sessionId, jsonlContent}.
 */
@Service
public class AgentSessionService {

    private static final Logger log = LoggerFactory.getLogger(AgentSessionService.class);

    private final Path sessionDir;
    private final ObjectMapper mapper = new ObjectMapper();

    public AgentSessionService(
            @Value("${agentspan.sessions.dir:#{systemProperties['user.home']}/.agentspan/sessions}")
            String sessionDir) {
        this.sessionDir = Paths.get(sessionDir);
        try {
            Files.createDirectories(this.sessionDir);
        } catch (IOException e) {
            log.error("Failed to create session directory {}: {}", sessionDir, e.getMessage());
        }
    }

    public Optional<Map<String, String>> getSession(String workflowId) {
        Path file = sessionFile(workflowId);
        if (!Files.exists(file)) {
            return Optional.empty();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, String> data = mapper.readValue(file.toFile(), Map.class);
            return Optional.of(data);
        } catch (IOException e) {
            log.warn("Failed to read session file for {}: {}", workflowId, e.getMessage());
            return Optional.empty();
        }
    }

    public void saveSession(String workflowId, String sessionId, String jsonlContent) {
        Path file = sessionFile(workflowId);
        try {
            mapper.writeValue(file.toFile(),
                Map.of("sessionId", sessionId, "jsonlContent", jsonlContent));
        } catch (IOException e) {
            log.error("Failed to save session for {}: {}", workflowId, e.getMessage());
        }
    }

    public void deleteSession(String workflowId) {
        try {
            Files.deleteIfExists(sessionFile(workflowId));
        } catch (IOException e) {
            log.warn("Failed to delete session for {}: {}", workflowId, e.getMessage());
        }
    }

    private Path sessionFile(String workflowId) {
        // Sanitize workflowId to safe filename: keep alphanumeric, dashes, underscores
        String safeName = workflowId.replaceAll("[^a-zA-Z0-9\\-_]", "_");
        return sessionDir.resolve(safeName + ".json");
    }
}
