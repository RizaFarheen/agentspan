package dev.agentspan.runtime.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * Structured output type configuration.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OutputTypeConfig {

    /** JSON Schema for the expected output. */
    private Map<String, Object> schema;

    /** Optional class name (for documentation). */
    private String className;
}
