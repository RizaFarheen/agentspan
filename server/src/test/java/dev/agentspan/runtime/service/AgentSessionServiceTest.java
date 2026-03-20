// server/src/test/java/dev/agentspan/runtime/service/AgentSessionServiceTest.java
package dev.agentspan.runtime.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class AgentSessionServiceTest {

    @TempDir
    Path tempDir;

    AgentSessionService service;

    @BeforeEach
    void setUp() {
        service = new AgentSessionService(tempDir.toString());
    }

    @Test
    void getSession_returnsEmptyWhenNotFound() {
        assertThat(service.getSession("nonexistent")).isEmpty();
    }

    @Test
    void saveAndGetSession_roundTrips() {
        service.saveSession("wf-123", "sess-abc", "line1\nline2\n");

        Optional<Map<String, String>> result = service.getSession("wf-123");
        assertThat(result).isPresent();
        assertThat(result.get().get("sessionId")).isEqualTo("sess-abc");
        assertThat(result.get().get("jsonlContent")).isEqualTo("line1\nline2\n");
    }

    @Test
    void saveSession_overwritesExisting() {
        service.saveSession("wf-123", "sess-abc", "old content");
        service.saveSession("wf-123", "sess-abc", "new content");

        Optional<Map<String, String>> result = service.getSession("wf-123");
        assertThat(result.get().get("jsonlContent")).isEqualTo("new content");
    }

    @Test
    void deleteSession_removesFile() {
        service.saveSession("wf-456", "sess-xyz", "content");
        assertThat(service.getSession("wf-456")).isPresent();

        service.deleteSession("wf-456");
        assertThat(service.getSession("wf-456")).isEmpty();
    }

    @Test
    void deleteSession_noopWhenNotFound() {
        // Must not throw
        service.deleteSession("nonexistent-workflow");
    }
}
