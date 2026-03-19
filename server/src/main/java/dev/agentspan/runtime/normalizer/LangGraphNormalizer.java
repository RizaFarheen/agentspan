/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.normalizer;

import dev.agentspan.runtime.model.AgentConfig;
import dev.agentspan.runtime.model.ToolConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Normalizes LangGraph rawConfig into a passthrough AgentConfig.
 * The passthrough workflow has one SIMPLE task wrapping the entire graph.
 */
@Component
public class LangGraphNormalizer implements AgentConfigNormalizer {

    private static final Logger log = LoggerFactory.getLogger(LangGraphNormalizer.class);
    private static final String DEFAULT_NAME = "langgraph_agent";

    @Override
    public String frameworkId() {
        return "langgraph";
    }

    @Override
    public AgentConfig normalize(Map<String, Object> raw) {
        String name = getString(raw, "name", DEFAULT_NAME);
        String workerName = getString(raw, "_worker_name", name);
        log.info("Normalizing LangGraph agent: {}", name);

        AgentConfig config = new AgentConfig();
        config.setName(name);
        // model is intentionally null — passthrough path does not call LLM_CHAT_COMPLETE

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("_framework_passthrough", true);
        config.setMetadata(metadata);

        ToolConfig worker = ToolConfig.builder()
            .name(workerName)
            .description("LangGraph passthrough worker")
            .toolType("worker")
            .build();
        config.setTools(List.of(worker));

        return config;
    }

    private String getString(Map<String, Object> map, String key, String defaultValue) {
        Object v = map.get(key);
        return v instanceof String ? (String) v : defaultValue;
    }
}
