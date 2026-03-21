/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.controller;

import dev.agentspan.runtime.auth.*;
import dev.agentspan.runtime.credentials.*;
import dev.agentspan.runtime.model.credentials.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CredentialControllerTest {

    @Mock private CredentialStoreProvider storeProvider;
    @Mock private CredentialBindingService bindingService;
    @Mock private CredentialResolutionService resolutionService;
    @Mock private ExecutionTokenService tokenService;

    @InjectMocks
    private CredentialController controller;

    private static final User TEST_USER = new User("u-1", "Alice", null, "alice");

    @BeforeEach
    void setUp() {
        RequestContext ctx = RequestContext.builder()
            .requestId("r-1").user(TEST_USER)
            .createdAt(java.time.Instant.now()).build();
        RequestContextHolder.set(ctx);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.clear();
    }

    @Test
    void listCredentials_delegatesToStoreProvider() {
        CredentialMeta meta = CredentialMeta.builder()
            .name("GITHUB_TOKEN").partial("ghp_...k2mn").build();
        when(storeProvider.list("u-1")).thenReturn(List.of(meta));

        ResponseEntity<?> response = controller.listCredentials();

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isInstanceOf(List.class);
    }

    @Test
    void createCredential_callsStoreSet() {
        ResponseEntity<?> response = controller.createCredential(
            Map.of("name", "MY_KEY", "value", "secret-value"));

        verify(storeProvider).set("u-1", "MY_KEY", "secret-value");
        assertThat(response.getStatusCode().value()).isEqualTo(201);
    }

    @Test
    void deleteCredential_callsStoreDelete() {
        ResponseEntity<?> response = controller.deleteCredential("MY_KEY");

        verify(storeProvider).delete("u-1", "MY_KEY");
        assertThat(response.getStatusCode().value()).isEqualTo(204);
    }

    @Test
    void setBinding_callsBindingService() {
        ResponseEntity<?> response = controller.setBinding("GITHUB_TOKEN",
            Map.of("store_name", "my-prod-key"));

        verify(bindingService).setBinding("u-1", "GITHUB_TOKEN", "my-prod-key");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void deleteBinding_callsBindingService() {
        ResponseEntity<?> response = controller.deleteBinding("GITHUB_TOKEN");

        verify(bindingService).deleteBinding("u-1", "GITHUB_TOKEN");
        assertThat(response.getStatusCode().value()).isEqualTo(204);
    }
}
