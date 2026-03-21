/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.ai;

import dev.agentspan.runtime.auth.*;
import dev.agentspan.runtime.credentials.CredentialResolutionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserAwareAIModelProviderTest {

    @Mock private CredentialResolutionService resolutionService;

    private UserAwareAIModelProvider provider;

    @BeforeEach
    void setUp() {
        provider = new UserAwareAIModelProvider(resolutionService);
    }

    @AfterEach
    void tearDown() { RequestContextHolder.clear(); }

    @Test
    void resolveApiKey_noUser_returnsNull() {
        String key = provider.resolveUserApiKey("openai");
        assertThat(key).isNull();
        verifyNoInteractions(resolutionService);
    }

    @Test
    void resolveApiKey_userWithOpenaiKey_returnsKey() {
        setUser("user-1");
        when(resolutionService.resolve("user-1", "OPENAI_API_KEY")).thenReturn("sk-user-key");

        String key = provider.resolveUserApiKey("openai");

        assertThat(key).isEqualTo("sk-user-key");
    }

    @Test
    void resolveApiKey_userHasNoKey_returnsNull() {
        setUser("user-2");
        when(resolutionService.resolve("user-2", "OPENAI_API_KEY")).thenReturn(null);

        String key = provider.resolveUserApiKey("openai");

        assertThat(key).isNull();
    }

    @Test
    void resolveApiKey_anthropic_mapsToCorrectEnvVar() {
        setUser("user-3");
        when(resolutionService.resolve("user-3", "ANTHROPIC_API_KEY")).thenReturn("sk-ant-key");

        String key = provider.resolveUserApiKey("anthropic");

        assertThat(key).isEqualTo("sk-ant-key");
    }

    @Test
    void resolveApiKey_unknownProvider_returnsNull() {
        setUser("user-4");
        String key = provider.resolveUserApiKey("unknown-provider-xyz");
        assertThat(key).isNull();
    }

    private void setUser(String userId) {
        RequestContextHolder.set(RequestContext.builder()
            .requestId("r1")
            .user(new User(userId, "Test", null, "test"))
            .createdAt(Instant.now()).build());
    }
}
