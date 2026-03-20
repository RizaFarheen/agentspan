/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.normalizer;

import dev.agentspan.runtime.model.AgentConfig;
import dev.agentspan.runtime.model.ToolConfig;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Normalizes Claude Agent SDK rawConfig to a passthrough AgentConfig.
 * The entire SDK execution runs as a single opaque SIMPLE Conductor worker.
 */
@Component
public class ClaudeAgentNormalizer implements AgentConfigNormalizer {

    @Override
    public String frameworkId() {
        return "claude";
    }

    @Override
    public AgentConfig normalize(Map<String, Object> raw) {
        String workerName = (String) raw.get("_worker_name");
        if (workerName == null || workerName.isBlank()) {
            throw new IllegalArgumentException(
                "Claude rawConfig missing required '_worker_name' field");
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("_framework_passthrough", true);
        metadata.put("_claude_conductor_subagents",
            raw.getOrDefault("conductor_subagents", false));
        metadata.put("_claude_agentspan_routing",
            raw.getOrDefault("agentspan_routing", false));

        ToolConfig workerTool = ToolConfig.builder()
            .name(workerName)
            .toolType("worker")
            .build();

        return AgentConfig.builder()
            .name(workerName)
            .metadata(metadata)
            .tools(List.of(workerTool))
            .build();
    }
}
