package dev.agentspan.runtime.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Memory configuration DTO.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MemoryConfig {

    /** Pre-loaded conversation messages. */
    private List<Map<String, Object>> messages;

    /** Maximum messages to retain. */
    private Integer maxMessages;
}
