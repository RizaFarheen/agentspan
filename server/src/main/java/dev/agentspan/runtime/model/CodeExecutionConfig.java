package dev.agentspan.runtime.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Code execution configuration.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CodeExecutionConfig {

    @Builder.Default
    private boolean enabled = false;

    private List<String> allowedLanguages;
    private List<String> allowedCommands;
    private Integer timeout;
}
