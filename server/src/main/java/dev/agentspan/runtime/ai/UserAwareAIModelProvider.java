/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.ai;

import dev.agentspan.runtime.auth.RequestContextHolder;
import dev.agentspan.runtime.credentials.CredentialResolutionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * Resolves per-user LLM API keys via the credential resolution pipeline.
 *
 * <p>Called by {@link AgentChatCompleteTaskMapper} before each LLM task dispatch.
 * If the current user has a credential stored for the provider's env var name,
 * that key overrides the server-level key. Falls back to null (Conductor uses
 * the server-configured key from application.properties).</p>
 *
 * <p>Provider → env var name mapping mirrors application.properties.</p>
 *
 * <p>TODO: VectorDBProvider per-user key injection is not yet implemented here.
 * When vector DB providers (e.g. Pinecone, Weaviate) support per-user API keys,
 * extend this class (or create a parallel VectorDBKeyProvider) to resolve those
 * credentials via the same pipeline. Deferred to a future task.</p>
 */
@Component
public class UserAwareAIModelProvider {

    private static final Logger log = LoggerFactory.getLogger(UserAwareAIModelProvider.class);

    /** Maps Conductor provider names to credential env var names. */
    private static final Map<String, String> PROVIDER_TO_ENV_VAR = Map.ofEntries(
        Map.entry("openai",      "OPENAI_API_KEY"),
        Map.entry("anthropic",   "ANTHROPIC_API_KEY"),
        Map.entry("mistral",     "MISTRAL_API_KEY"),
        Map.entry("cohere",      "COHERE_API_KEY"),
        Map.entry("grok",        "XAI_API_KEY"),
        Map.entry("perplexity",  "PERPLEXITY_API_KEY"),
        Map.entry("huggingface", "HUGGINGFACE_API_KEY"),
        Map.entry("stabilityai", "STABILITY_API_KEY"),
        Map.entry("azureopenai","AZURE_OPENAI_API_KEY"),
        Map.entry("gemini",      "GEMINI_API_KEY")
    );

    private final CredentialResolutionService resolutionService;

    @Autowired
    public UserAwareAIModelProvider(CredentialResolutionService resolutionService) {
        this.resolutionService = resolutionService;
    }

    /**
     * Resolve a per-user API key for the given LLM provider.
     *
     * @param provider Conductor provider name (e.g. "openai", "anthropic")
     * @return per-user API key, or null if not configured (Conductor uses server key)
     */
    public String resolveUserApiKey(String provider) {
        Optional<String> userId = RequestContextHolder.get()
            .map(ctx -> ctx.getUser().getId());
        if (userId.isEmpty()) {
            return null;
        }

        String envVarName = PROVIDER_TO_ENV_VAR.get(provider.toLowerCase());
        if (envVarName == null) {
            return null;
        }

        try {
            return resolutionService.resolve(userId.get(), envVarName);
        } catch (CredentialResolutionService.CredentialNotFoundException e) {
            return null;
        } catch (Exception e) {
            log.warn("Failed to resolve per-user API key for provider '{}': {}", provider, e.getMessage());
            return null;
        }
    }
}
