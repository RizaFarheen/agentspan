package dev.agentspan.runtime.normalizer;

import dev.agentspan.runtime.model.AgentConfig;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Registry of {@link AgentConfigNormalizer} implementations, keyed by framework ID.
 *
 * <p>Spring auto-discovers all normalizer beans and registers them here.
 * Use {@link #normalize(String, Map)} to convert a framework-specific raw config
 * into the canonical {@link AgentConfig}.
 */
@Component
public class NormalizerRegistry {

    private final Map<String, AgentConfigNormalizer> normalizers = new HashMap<>();

    public NormalizerRegistry(List<AgentConfigNormalizer> allNormalizers) {
        for (AgentConfigNormalizer n : allNormalizers) {
            normalizers.put(n.frameworkId(), n);
        }
    }

    /**
     * Normalize a framework-specific raw config into the canonical AgentConfig.
     *
     * @param framework the framework identifier (e.g. "openai", "google_adk")
     * @param rawConfig the raw agent config as deserialized JSON
     * @return the normalized AgentConfig
     * @throws IllegalArgumentException if the framework is not supported
     */
    public AgentConfig normalize(String framework, Map<String, Object> rawConfig) {
        AgentConfigNormalizer normalizer = normalizers.get(framework);
        if (normalizer == null) {
            throw new IllegalArgumentException(
                    "Unsupported agent framework: '" + framework
                            + "'. Supported frameworks: " + normalizers.keySet());
        }
        return normalizer.normalize(rawConfig);
    }

    /** Check whether a given framework is supported. */
    public boolean supports(String framework) {
        return normalizers.containsKey(framework);
    }
}
