package dev.agentspan.runtime.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import static com.netflix.conductor.common.metadata.tasks.TaskType.TASK_TYPE_HUMAN;

/**
 * Registers {@link AgentHumanTask} as the primary HUMAN task implementation,
 * overriding Conductor's default {@code Human} system task.
 */
@Configuration
public class AgentHumanTaskConfig {

    @Bean(TASK_TYPE_HUMAN)
    @Primary
    public AgentHumanTask agentHumanTask(AgentStreamRegistry streamRegistry) {
        return new AgentHumanTask(streamRegistry);
    }
}
