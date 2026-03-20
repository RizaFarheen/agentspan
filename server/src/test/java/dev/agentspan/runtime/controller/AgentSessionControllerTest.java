package dev.agentspan.runtime.controller;

import dev.agentspan.runtime.service.AgentSessionService;
import org.conductoross.conductor.AgentRuntime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = AgentRuntime.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AgentSessionControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean AgentSessionService agentSessionService;

    @Test
    void getSession_returns404WhenNotFound() throws Exception {
        when(agentSessionService.getSession("wf-123")).thenReturn(Optional.empty());
        mockMvc.perform(get("/api/agent-sessions/wf-123"))
               .andExpect(status().isNotFound());
    }

    @Test
    void getSession_returns200WithData() throws Exception {
        when(agentSessionService.getSession("wf-123"))
            .thenReturn(Optional.of(Map.of("sessionId", "s-1", "jsonlContent", "line1")));
        mockMvc.perform(get("/api/agent-sessions/wf-123"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.sessionId").value("s-1"));
    }

    @Test
    void postSession_returns200() throws Exception {
        mockMvc.perform(post("/api/agent-sessions/wf-123")
               .contentType(MediaType.APPLICATION_JSON)
               .content("{\"sessionId\":\"s-1\",\"jsonlContent\":\"line1\"}"))
               .andExpect(status().isOk());
        verify(agentSessionService).saveSession("wf-123", "s-1", "line1");
    }

    @Test
    void postSession_returns400WhenMissingFields() throws Exception {
        mockMvc.perform(post("/api/agent-sessions/wf-123")
               .contentType(MediaType.APPLICATION_JSON)
               .content("{\"sessionId\":\"s-1\"}"))
               .andExpect(status().isBadRequest());
    }

    @Test
    void deleteSession_returns200() throws Exception {
        mockMvc.perform(delete("/api/agent-sessions/wf-123"))
               .andExpect(status().isOk());
        verify(agentSessionService).deleteSession("wf-123");
    }
}
