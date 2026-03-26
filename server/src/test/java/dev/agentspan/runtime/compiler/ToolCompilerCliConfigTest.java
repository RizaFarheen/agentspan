/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package dev.agentspan.runtime.compiler;

import com.netflix.conductor.common.metadata.workflow.WorkflowTask;

import dev.agentspan.runtime.model.ToolConfig;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ToolCompilerCliConfigTest {

    @Test
    void buildEnrichTask_includesCliPolicyAndCredentialOverrides() {
        ToolConfig cliTool = ToolConfig.builder()
                .name("run_command")
                .description("Run shell commands")
                .toolType("cli")
                .config(Map.of(
                        "allowedCommands", List.of("gh", "git"),
                        "allowShell", true,
                        "timeout", 90,
                        "credentials", List.of("GITHUB_TOKEN")
                ))
                .build();

        ToolCompiler compiler = new ToolCompiler();
        Object[] result = compiler.buildEnrichTask("agent", "llm", List.of(cliTool), "");
        WorkflowTask enrichTask = (WorkflowTask) result[0];
        @SuppressWarnings("unchecked")
        Map<String, Object> inputParameters = (Map<String, Object>) enrichTask.getInputParameters();
        String expression = (String) inputParameters.get("expression");

        assertThat(expression).contains("\"allowedCommands\":[\"gh\",\"git\"]");
        assertThat(expression).contains("\"credentials\":[\"GITHUB_TOKEN\"]");
        assertThat(expression).contains("_allowed_commands");
        assertThat(expression).contains("_allow_shell");
        assertThat(expression).contains("_timeout");
        assertThat(expression).contains("_credential_names");
    }
}
