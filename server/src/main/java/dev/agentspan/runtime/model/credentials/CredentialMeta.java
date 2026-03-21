/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.model.credentials;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Credential metadata returned in list and single-item responses.
 * The plaintext value is NEVER included — only a partial display.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CredentialMeta {
    private String name;
    private String partial;    // first4 + "..." + last4
    private Instant createdAt;
    private Instant updatedAt;
}
