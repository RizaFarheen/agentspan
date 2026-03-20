package dev.agentspan.runtime.normalizer;

import dev.agentspan.runtime.model.AgentConfig;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClaudeAgentNormalizerTest {

    private final ClaudeAgentNormalizer normalizer = new ClaudeAgentNormalizer();

    @Test
    void frameworkId_returnsClaude() {
        assertThat(normalizer.frameworkId()).isEqualTo("claude");
    }

    @Test
    void normalize_setsPassthroughMetadata() {
        Map<String, Object> raw = Map.of(
            "_worker_name", "_fw_claude_my_agent",
            "conductor_subagents", false,
            "agentspan_routing", false
        );
        AgentConfig config = normalizer.normalize(raw);
        assertThat(config.getMetadata()).containsEntry("_framework_passthrough", true);
        assertThat(config.getMetadata()).containsKey("_claude_conductor_subagents");
        assertThat(config.getMetadata()).containsKey("_claude_agentspan_routing");
    }

    @Test
    void normalize_setsWorkerTool() {
        Map<String, Object> raw = Map.of(
            "_worker_name", "_fw_claude_my_agent",
            "conductor_subagents", false,
            "agentspan_routing", false
        );
        AgentConfig config = normalizer.normalize(raw);
        assertThat(config.getTools()).hasSize(1);
        assertThat(config.getTools().get(0).getName()).isEqualTo("_fw_claude_my_agent");
        assertThat(config.getTools().get(0).getToolType()).isEqualTo("worker");
    }

    @Test
    void normalize_setsAgentName() {
        Map<String, Object> raw = Map.of(
            "_worker_name", "_fw_claude_my_agent",
            "conductor_subagents", false,
            "agentspan_routing", true
        );
        AgentConfig config = normalizer.normalize(raw);
        assertThat(config.getName()).isEqualTo("_fw_claude_my_agent");
    }

    @Test
    void normalize_throwsWhenWorkerNameMissing() {
        assertThatThrownBy(() -> normalizer.normalize(Map.of()))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("_worker_name");
    }
}
