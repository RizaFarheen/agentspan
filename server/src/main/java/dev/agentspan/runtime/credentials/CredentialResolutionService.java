/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.credentials;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Single authority for credential resolution across all call paths.
 *
 * <p>Three-step pipeline (documented intentional fallthroughs):</p>
 * <ol>
 *   <li>Look up binding: userId + logicalKey → storeName
 *       (if no binding, use logicalKey as storeName directly — convenience shortcut)</li>
 *   <li>Fetch from CredentialStoreProvider using storeName</li>
 *   <li>Not found in store?
 *       strict_mode=false → check os.environ[logicalKey] → return if present
 *       strict_mode=true  → throw CredentialNotFoundException</li>
 * </ol>
 */
@Service
public class CredentialResolutionService {

    private static final Logger log = LoggerFactory.getLogger(CredentialResolutionService.class);

    private final CredentialStoreProvider storeProvider;
    private final CredentialBindingService bindingService;

    @Value("${agentspan.credentials.strict-mode:false}")
    private boolean strictMode;

    public CredentialResolutionService(CredentialStoreProvider storeProvider,
                                       CredentialBindingService bindingService) {
        this.storeProvider = storeProvider;
        this.bindingService = bindingService;
    }

    /**
     * Resolve a logical credential key for a user.
     *
     * @return the plaintext credential value, or null if not found (non-strict mode only)
     * @throws CredentialNotFoundException if strict_mode=true and credential not found anywhere
     */
    public String resolve(String userId, String logicalKey) {
        // Step 1: Look up binding → store name (or use logicalKey directly)
        Optional<String> binding = bindingService.resolve(userId, logicalKey);
        String storeName = binding.orElse(logicalKey);

        // Step 2: Fetch from store
        String value = storeProvider.get(userId, storeName);
        if (value != null) {
            return value;
        }

        // Step 3: Env var fallback
        if (!strictMode) {
            String envValue = getEnvVar(logicalKey);
            if (envValue != null) {
                log.debug("Credential '{}' resolved from environment variable (store miss)", logicalKey);
                return envValue;
            }
            log.debug("Credential '{}' not found in store or environment for user '{}'", logicalKey, userId);
            return null;
        }

        // strict_mode=true — no env var fallback
        throw new CredentialNotFoundException(logicalKey);
    }

    /** Package-private for test overriding via spy */
    String getEnvVar(String name) {
        return System.getenv(name);
    }

    public static class CredentialNotFoundException extends RuntimeException {
        public CredentialNotFoundException(String name) {
            super("Credential not found: " + name +
                " (not in store, and strict_mode=true prevents env var fallback)");
        }
    }
}
