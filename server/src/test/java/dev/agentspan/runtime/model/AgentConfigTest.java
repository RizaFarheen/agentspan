package dev.agentspan.runtime.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class AgentConfigTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void testSerializeDeserialize() throws Exception {
        AgentConfig config = AgentConfig.builder()
            .name("test_agent")
            .model("openai/gpt-4o")
            .instructions("Be helpful.")
            .maxTurns(10)
            .temperature(0.5)
            .tools(List.of(
                ToolConfig.builder()
                    .name("search")
                    .description("Search")
                    .toolType("worker")
                    .build()
            ))
            .guardrails(List.of(
                GuardrailConfig.builder()
                    .name("no_pii")
                    .guardrailType("regex")
                    .patterns(List.of("\\d{3}-\\d{2}-\\d{4}"))
                    .mode("block")
                    .build()
            ))
            .build();

        String json = mapper.writeValueAsString(config);
        AgentConfig deserialized = mapper.readValue(json, AgentConfig.class);

        assertThat(deserialized.getName()).isEqualTo("test_agent");
        assertThat(deserialized.getModel()).isEqualTo("openai/gpt-4o");
        assertThat(deserialized.getMaxTurns()).isEqualTo(10);
        assertThat(deserialized.getTemperature()).isEqualTo(0.5);
        assertThat(deserialized.getTools()).hasSize(1);
        assertThat(deserialized.getGuardrails()).hasSize(1);
    }

    @Test
    void testNullFieldsOmitted() throws Exception {
        AgentConfig config = AgentConfig.builder()
            .name("minimal")
            .model("openai/gpt-4o")
            .build();

        String json = mapper.writeValueAsString(config);
        assertThat(json).doesNotContain("\"tools\"");
        assertThat(json).doesNotContain("\"guardrails\"");
        assertThat(json).doesNotContain("\"termination\"");
    }

    @Test
    void testNestedAgentSerialization() throws Exception {
        AgentConfig config = AgentConfig.builder()
            .name("parent")
            .model("openai/gpt-4o")
            .strategy("handoff")
            .agents(List.of(
                AgentConfig.builder().name("child1").model("openai/gpt-4o").build(),
                AgentConfig.builder().name("child2").model("anthropic/claude-sonnet-4-20250514").build()
            ))
            .build();

        String json = mapper.writeValueAsString(config);
        AgentConfig deserialized = mapper.readValue(json, AgentConfig.class);

        assertThat(deserialized.getAgents()).hasSize(2);
        assertThat(deserialized.getAgents().get(0).getName()).isEqualTo("child1");
        assertThat(deserialized.getAgents().get(1).getName()).isEqualTo("child2");
    }

    @Test
    void testTerminationConfigSerialization() throws Exception {
        TerminationConfig term = TerminationConfig.builder()
            .type("and")
            .conditions(List.of(
                TerminationConfig.builder().type("text_mention").text("DONE").build(),
                TerminationConfig.builder().type("max_message").maxMessages(10).build()
            ))
            .build();

        String json = mapper.writeValueAsString(term);
        TerminationConfig deserialized = mapper.readValue(json, TerminationConfig.class);

        assertThat(deserialized.getType()).isEqualTo("and");
        assertThat(deserialized.getConditions()).hasSize(2);
    }
}
