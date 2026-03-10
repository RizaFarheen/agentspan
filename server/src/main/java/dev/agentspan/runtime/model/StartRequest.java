package dev.agentspan.runtime.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Request DTO for POST /api/agent/start.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StartRequest {

    private AgentConfig agentConfig;
    private String prompt;
    private String sessionId;
    private List<String> media;
    private String idempotencyKey;

    /** Framework identifier for foreign agents (e.g. "openai", "google_adk"). Null for native agents. */
    private String framework;

    /** Raw framework-specific agent config. Used when {@code framework} is non-null. */
    private Map<String, Object> rawConfig;
}
