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
import java.util.LinkedHashMap;

/**
 * Normalizes LangGraph rawConfig into an AgentConfig.
 *
 * <p>Two serialization paths:
 * <ul>
 *   <li><b>Full extraction</b> — rawConfig has {@code model} and {@code tools} with
 *       {@code _worker_ref} markers (produced by {@code agentspan.agents.langchain.create_agent}).
 *       Normalizes identically to OpenAI: AI_MODEL task + SIMPLE tasks per tool.</li>
 *   <li><b>Passthrough</b> — rawConfig has {@code _worker_name} (custom StateGraph).
 *       The entire graph runs in a single SIMPLE task.</li>
 * </ul>
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
    @SuppressWarnings("unchecked")
    public AgentConfig normalize(Map<String, Object> raw) {
        String name = getString(raw, "name", DEFAULT_NAME);
        log.info("Normalizing LangGraph agent: {}", name);

        // Full extraction path: model present and no _worker_name
        if (raw.containsKey("model") && !raw.containsKey("_worker_name")) {
            return normalizeFullExtraction(name, raw);
        }

        // Passthrough path: custom StateGraph running in a single worker
        return normalizePassthrough(name, raw);
    }

    private AgentConfig normalizeFullExtraction(String name, Map<String, Object> raw) {
        log.info("LangGraph agent '{}' using full extraction (server-side LLM)", name);

        AgentConfig config = new AgentConfig();
        config.setName(name);
        config.setModel(getString(raw, "model", "openai/gpt-4o-mini"));
        config.setInstructions(raw.get("instructions"));

        if (raw.containsKey("temperature")) {
            Object t = raw.get("temperature");
            if (t instanceof Number) config.setTemperature(((Number) t).doubleValue());
        }
        if (raw.containsKey("max_tokens")) {
            Object mt = raw.get("max_tokens");
            if (mt instanceof Number) config.setMaxTokens(((Number) mt).intValue());
        }

        List<Map<String, Object>> rawTools = getList(raw, "tools");
        if (rawTools != null) {
            List<ToolConfig> tools = new ArrayList<>();
            for (Map<String, Object> t : rawTools) {
                // Agent-as-tool: compile child agent as SUB_WORKFLOW
                if ("AgentTool".equals(getString(t, "_type", ""))) {
                    ToolConfig agentTool = normalizeAgentTool(t);
                    if (agentTool != null) tools.add(agentTool);
                    continue;
                }
                if (t.containsKey("_worker_ref")) {
                    tools.add(ToolConfig.builder()
                            .name(getString(t, "_worker_ref", "unknown_tool"))
                            .description(getString(t, "description", ""))
                            .inputSchema((Map<String, Object>) t.get("parameters"))
                            .toolType("worker")
                            .build());
                }
            }
            if (!tools.isEmpty()) {
                config.setTools(tools);
            }
        }

        return config;
    }

    private AgentConfig normalizePassthrough(String name, Map<String, Object> raw) {
        log.info("LangGraph agent '{}' using passthrough (local graph execution)", name);
        String workerName = getString(raw, "_worker_name", name);

        AgentConfig config = new AgentConfig();
        config.setName(name);

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

    @SuppressWarnings("unchecked")
    private ToolConfig normalizeAgentTool(Map<String, Object> raw) {
        Map<String, Object> agentRaw = getMap(raw, "agent");
        if (agentRaw == null) {
            log.warn("AgentTool '{}' has no embedded agent config, skipping",
                    getString(raw, "name", "unknown"));
            return null;
        }

        AgentConfig childAgent = normalize(agentRaw);
        String toolName = getString(raw, "name", childAgent.getName());
        String toolDesc = getString(raw, "description", "Invoke agent: " + childAgent.getName());

        Map<String, Object> inputSchema = new LinkedHashMap<>();
        inputSchema.put("type", "object");
        inputSchema.put("properties", Map.of(
                "request", Map.of("type", "string",
                        "description", "The request or question to send to this agent")
        ));
        inputSchema.put("required", List.of("request"));
        inputSchema.put("additionalProperties", false);

        Map<String, Object> toolConfig = new LinkedHashMap<>();
        toolConfig.put("agentConfig", childAgent);

        return ToolConfig.builder()
                .name(toolName)
                .description(toolDesc)
                .inputSchema(inputSchema)
                .toolType("agent_tool")
                .config(toolConfig)
                .build();
    }

    private String getString(Map<String, Object> map, String key, String defaultValue) {
        Object v = map.get(key);
        return v instanceof String ? (String) v : defaultValue;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getList(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof List) return (List<Map<String, Object>>) v;
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Map) return (Map<String, Object>) v;
        return null;
    }
}
