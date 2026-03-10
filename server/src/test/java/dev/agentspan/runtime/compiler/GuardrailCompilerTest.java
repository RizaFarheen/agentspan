package dev.agentspan.runtime.compiler;

import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import org.junit.jupiter.api.Test;
import dev.agentspan.runtime.model.GuardrailConfig;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

class GuardrailCompilerTest {

    @Test
    void testRegexBlock() {
        GuardrailConfig g = GuardrailConfig.builder()
            .name("no_ssn")
            .guardrailType("regex")
            .position("output")
            .onFail("retry")
            .patterns(List.of("\\d{3}-\\d{2}-\\d{4}"))
            .mode("block")
            .build();

        GuardrailCompiler gc = new GuardrailCompiler();
        var results = gc.compileGuardrailTasks(List.of(g), "agent", "${agent_llm.output.result}");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).isInline()).isTrue();
        assertThat(results.get(0).getTasks()).hasSize(1);
        assertThat(results.get(0).getTasks().get(0).getType()).isEqualTo("INLINE");
        assertThat(results.get(0).getRefName()).isEqualTo("agent_regex_guardrail_no_ssn");
    }

    @Test
    void testLLMGuardrail() {
        GuardrailConfig g = GuardrailConfig.builder()
            .name("safety")
            .guardrailType("llm")
            .position("output")
            .model("openai/gpt-4o")
            .policy("No harmful content")
            .onFail("retry")
            .build();

        GuardrailCompiler gc = new GuardrailCompiler();
        var results = gc.compileGuardrailTasks(List.of(g), "agent", "${ref}");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).isInline()).isTrue();
        // LLM guardrail produces 2 tasks (LLM + parser)
        assertThat(results.get(0).getTasks()).hasSize(2);
        assertThat(results.get(0).getTasks().get(0).getType()).isEqualTo("LLM_CHAT_COMPLETE");
        assertThat(results.get(0).getTasks().get(1).getType()).isEqualTo("INLINE");
    }

    @Test
    void testCustomGuardrail() {
        GuardrailConfig g = GuardrailConfig.builder()
            .name("custom_check")
            .guardrailType("custom")
            .position("output")
            .taskName("my_guardrail_worker")
            .onFail("raise")
            .build();

        GuardrailCompiler gc = new GuardrailCompiler();
        var results = gc.compileGuardrailTasks(List.of(g), "agent", "${ref}");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).isInline()).isFalse();
        assertThat(results.get(0).getTasks().get(0).getType()).isEqualTo("SIMPLE");
    }

    @Test
    void testRoutingRetry() {
        GuardrailConfig g = GuardrailConfig.builder()
            .name("test")
            .guardrailType("regex")
            .position("output")
            .onFail("retry")
            .build();

        GuardrailCompiler gc = new GuardrailCompiler();
        var routing = gc.compileGuardrailRouting(g, "guard_ref", "${content}", "agent", "", true);

        assertThat(routing.getSwitchTask().getType()).isEqualTo("SWITCH");
        assertThat(routing.getSwitchTask().getDecisionCases()).containsKey("retry");
        assertThat(routing.getRetryRef()).isEqualTo("agent_guardrail_retry");
    }

    @Test
    void testRoutingRaise() {
        GuardrailConfig g = GuardrailConfig.builder()
            .name("test")
            .guardrailType("regex")
            .position("output")
            .onFail("raise")
            .build();

        GuardrailCompiler gc = new GuardrailCompiler();
        var routing = gc.compileGuardrailRouting(g, "guard_ref", "${content}", "agent", "", false);

        assertThat(routing.getSwitchTask().getDecisionCases()).containsKey("raise");
        List<WorkflowTask> raiseTasks = routing.getSwitchTask().getDecisionCases().get("raise");
        assertThat(raiseTasks.get(0).getType()).isEqualTo("TERMINATE");
    }
}
