/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.credentials;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CredentialResolutionServiceTest {

    @Mock private CredentialStoreProvider storeProvider;
    @Mock private CredentialBindingService bindingService;

    @InjectMocks
    private CredentialResolutionService service;

    private static final String USER_ID = "user-abc";

    @BeforeEach
    void setUp() {
        // Default strict_mode=false
        ReflectionTestUtils.setField(service, "strictMode", false);
    }

    @Test
    void resolve_withBinding_fetchesFromStore() {
        when(bindingService.resolve(USER_ID, "GITHUB_TOKEN")).thenReturn(Optional.of("my-github-prod"));
        when(storeProvider.get(USER_ID, "my-github-prod")).thenReturn("ghp_secret");

        String value = service.resolve(USER_ID, "GITHUB_TOKEN");

        assertThat(value).isEqualTo("ghp_secret");
    }

    @Test
    void resolve_noBinding_usesLogicalKeyAsStoreName() {
        when(bindingService.resolve(USER_ID, "GITHUB_TOKEN")).thenReturn(Optional.empty());
        when(storeProvider.get(USER_ID, "GITHUB_TOKEN")).thenReturn("ghp_directlookup");

        String value = service.resolve(USER_ID, "GITHUB_TOKEN");

        assertThat(value).isEqualTo("ghp_directlookup");
    }

    @Test
    void resolve_notInStore_strictModeFalse_fallsBackToEnv() {
        when(bindingService.resolve(USER_ID, "MY_ENV_VAR")).thenReturn(Optional.empty());
        when(storeProvider.get(USER_ID, "MY_ENV_VAR")).thenReturn(null);

        // Inject a mock env lookup — we use a subclass to override
        // Actually for unit test, inject the env via a spy
        CredentialResolutionService spy = spy(service);
        doReturn("from_env_val").when(spy).getEnvVar("MY_ENV_VAR");

        String value = spy.resolve(USER_ID, "MY_ENV_VAR");

        assertThat(value).isEqualTo("from_env_val");
    }

    @Test
    void resolve_notInStore_strictModeTrue_throws() {
        ReflectionTestUtils.setField(service, "strictMode", true);
        when(bindingService.resolve(USER_ID, "MISSING")).thenReturn(Optional.empty());
        when(storeProvider.get(USER_ID, "MISSING")).thenReturn(null);

        assertThatThrownBy(() -> service.resolve(USER_ID, "MISSING"))
            .isInstanceOf(CredentialResolutionService.CredentialNotFoundException.class)
            .hasMessageContaining("MISSING");
    }

    @Test
    void resolve_notInStore_notInEnv_strictModeFalse_returnsNull() {
        when(bindingService.resolve(USER_ID, "TOTALLY_MISSING")).thenReturn(Optional.empty());
        when(storeProvider.get(USER_ID, "TOTALLY_MISSING")).thenReturn(null);

        CredentialResolutionService spy = spy(service);
        doReturn(null).when(spy).getEnvVar("TOTALLY_MISSING");

        String value = spy.resolve(USER_ID, "TOTALLY_MISSING");

        assertThat(value).isNull();
    }
}
