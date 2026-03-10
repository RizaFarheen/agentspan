package dev.agentspan.runtime.compiler;

import com.netflix.conductor.common.metadata.workflow.WorkflowTask;
import org.junit.jupiter.api.Test;
import dev.agentspan.runtime.model.ToolConfig;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class ToolCompilerTest {

    @Test
    void testCompileToolSpecs_Worker() {
        ToolConfig tool = ToolConfig.builder()
            .name("search")
            .description("Search the web")
            .inputSchema(Map.of("type", "object"))
            .toolType("worker")
            .build();

        ToolCompiler tc = new ToolCompiler();
        List<Map<String, Object>> specs = tc.compileToolSpecs(List.of(tool));

        assertThat(specs).hasSize(1);
        assertThat(specs.get(0).get("name")).isEqualTo("search");
        assertThat(specs.get(0).get("type")).isEqualTo("SIMPLE");
    }

    @Test
    void testCompileToolSpecs_Http() {
        ToolConfig tool = ToolConfig.builder()
            .name("weather_api")
            .description("Get weather")
            .toolType("http")
            .config(Map.of("url", "https://api.weather.com", "method", "GET"))
            .build();

        ToolCompiler tc = new ToolCompiler();
        List<Map<String, Object>> specs = tc.compileToolSpecs(List.of(tool));

        assertThat(specs.get(0).get("type")).isEqualTo("HTTP");
    }

    @Test
    void testCompileToolSpecs_Mcp() {
        ToolConfig tool = ToolConfig.builder()
            .name("mcp_tool")
            .description("MCP tool")
            .toolType("mcp")
            .config(Map.of("server_url", "http://mcp.example.com", "headers", Map.of("auth", "key")))
            .build();

        ToolCompiler tc = new ToolCompiler();
        List<Map<String, Object>> specs = tc.compileToolSpecs(List.of(tool));

        assertThat(specs.get(0).get("type")).isEqualTo("CALL_MCP_TOOL");
        @SuppressWarnings("unchecked")
        Map<String, Object> configParams = (Map<String, Object>) specs.get(0).get("configParams");
        assertThat(configParams.get("mcpServer")).isEqualTo("http://mcp.example.com");
    }

    @Test
    void testBuildToolCallRouting() {
        ToolCompiler tc = new ToolCompiler();
        WorkflowTask router = tc.buildToolCallRouting("agent", "agent_llm", null, false, "");

        assertThat(router.getType()).isEqualTo("SWITCH");
        assertThat(router.getTaskReferenceName()).isEqualTo("agent_tool_router");
        assertThat(router.getDecisionCases()).containsKey("tool_call");
    }

    @Test
    void testBuildDynamicFork() {
        ToolCompiler tc = new ToolCompiler();
        WorkflowTask fork = tc.buildDynamicFork("agent", "${ref}", "");

        assertThat(fork.getType()).isEqualTo("FORK_JOIN_DYNAMIC");
        assertThat(fork.getDynamicForkTasksParam()).isEqualTo("dynamicTasks");
    }

    @Test
    void testCompileToolSpecs_AgentTool() {
        ToolConfig tool = ToolConfig.builder()
            .name("research_agent")
            .description("Invoke the research agent")
            .toolType("agent_tool")
            .inputSchema(Map.of(
                "type", "object",
                "properties", Map.of("request", Map.of("type", "string")),
                "required", List.of("request")))
            .config(Map.of("workflowName", "research_agent_wf"))
            .build();

        ToolCompiler tc = new ToolCompiler();
        List<Map<String, Object>> specs = tc.compileToolSpecs(List.of(tool));

        assertThat(specs).hasSize(1);
        assertThat(specs.get(0).get("name")).isEqualTo("research_agent");
        assertThat(specs.get(0).get("type")).isEqualTo("SUB_WORKFLOW");
    }

    @Test
    void testBuildEnrichTask_AgentTool() {
        ToolConfig agentTool = ToolConfig.builder()
            .name("researcher")
            .toolType("agent_tool")
            .config(Map.of("workflowName", "researcher_agent_wf"))
            .build();

        ToolCompiler tc = new ToolCompiler();
        Object[] result = tc.buildEnrichTask("agent", "agent_llm", List.of(agentTool), "");

        WorkflowTask enrichTask = (WorkflowTask) result[0];
        assertThat(enrichTask.getType()).isEqualTo("INLINE");

        // The enrichment script should contain the agentToolCfg with the workflow name
        String script = (String) enrichTask.getInputParameters().get("expression");
        assertThat(script).contains("agentToolCfg");
        assertThat(script).contains("researcher_agent_wf");
        assertThat(script).contains("SUB_WORKFLOW");
    }
}
