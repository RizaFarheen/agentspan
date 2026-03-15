/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.ai;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

/**
 * Tests for the SUB_WORKFLOW result extraction logic in AgentChatCompleteTaskMapper.
 */
class AgentChatCompleteTaskMapperTest {

    private final AgentChatCompleteTaskMapper mapper = new AgentChatCompleteTaskMapper();

    @Test
    void testExtractSubWorkflowResult_extractsResultField() throws Exception {
        Map<String, Object> outputData = new HashMap<>();
        outputData.put("subWorkflowId", "abc-123");
        outputData.put("result", "Afghanistan has a GDP of $20B and a population of 40M.");
        outputData.put("finishReason", "STOP");
        outputData.put("rejectionReason", null);

        Map<String, Object> result = invokeExtractResult(outputData);

        assertThat(result).containsOnlyKeys("result");
        assertThat(result.get("result")).isEqualTo(
                "Afghanistan has a GDP of $20B and a population of 40M.");
    }

    @Test
    void testExtractSubWorkflowResult_nullOutput() throws Exception {
        Map<String, Object> result = invokeExtractResult(null);
        assertThat(result).containsEntry("result", "");
    }

    @Test
    void testExtractSubWorkflowResult_noResultField() throws Exception {
        Map<String, Object> outputData = Map.of("subWorkflowId", "abc-123");
        Map<String, Object> result = invokeExtractResult(outputData);
        // Falls back to full output
        assertThat(result).containsKey("subWorkflowId");
    }

    @Test
    void testExtractSubWorkflowInput_extractsWorkflowInput() throws Exception {
        Map<String, Object> inputData = new HashMap<>();
        inputData.put("subWorkflowDefinition", Map.of("name", "researcher_wf", "tasks", "..."));
        inputData.put("workflowInput", Map.of("prompt", "Afghanistan", "session_id", ""));

        Map<String, Object> result = invokeExtractInput(inputData);

        assertThat(result).containsEntry("prompt", "Afghanistan");
        assertThat(result).containsEntry("session_id", "");
        assertThat(result).doesNotContainKey("subWorkflowDefinition");
    }

    @Test
    void testExtractSubWorkflowInput_nullInput() throws Exception {
        Map<String, Object> result = invokeExtractInput(null);
        assertThat(result).isEmpty();
    }

    @Test
    void testExtractSubWorkflowInput_noWorkflowInput_removesDefinition() throws Exception {
        Map<String, Object> inputData = new HashMap<>();
        inputData.put("subWorkflowDefinition", Map.of("name", "some_wf"));
        inputData.put("otherField", "value");

        Map<String, Object> result = invokeExtractInput(inputData);

        assertThat(result).doesNotContainKey("subWorkflowDefinition");
        assertThat(result).containsEntry("otherField", "value");
    }

    // Use reflection to test private methods
    @SuppressWarnings("unchecked")
    private Map<String, Object> invokeExtractResult(Map<String, Object> outputData) throws Exception {
        Method method = AgentChatCompleteTaskMapper.class.getDeclaredMethod(
                "extractSubWorkflowResult", Map.class);
        method.setAccessible(true);
        return (Map<String, Object>) method.invoke(mapper, outputData);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> invokeExtractInput(Map<String, Object> inputData) throws Exception {
        Method method = AgentChatCompleteTaskMapper.class.getDeclaredMethod(
                "extractSubWorkflowInput", Map.class);
        method.setAccessible(true);
        return (Map<String, Object>) method.invoke(mapper, inputData);
    }
}
