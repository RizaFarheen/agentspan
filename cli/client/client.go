package client

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/openagent/cli/config"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	authKey    string
	authSecret string
}

func New(cfg *config.Config) *Client {
	return &Client{
		baseURL:    strings.TrimRight(cfg.ServerURL, "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
		authKey:    cfg.AuthKey,
		authSecret: cfg.AuthSecret,
	}
}

func (c *Client) doRequest(method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.authKey != "" {
		req.Header.Set("X-Auth-Key", c.authKey)
	}
	if c.authSecret != "" {
		req.Header.Set("X-Auth-Secret", c.authSecret)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}
	return resp, nil
}

// HealthCheck pings the server
func (c *Client) HealthCheck() error {
	resp, err := c.doRequest("GET", "/api/agent", nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// StartRequest is the payload for starting an agent
type StartRequest struct {
	AgentConfig map[string]interface{} `json:"agentConfig"`
	Prompt      string                 `json:"prompt"`
	SessionID   string                 `json:"sessionId,omitempty"`
}

// StartResponse from the runtime
type StartResponse struct {
	WorkflowID   string `json:"workflowId"`
	WorkflowName string `json:"workflowName"`
}

// Start compiles, registers, and starts an agent workflow
func (c *Client) Start(req *StartRequest) (*StartResponse, error) {
	resp, err := c.doRequest("POST", "/api/agent/start", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result StartResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

// Compile compiles an agent config to a workflow definition
func (c *Client) Compile(agentConfig map[string]interface{}) (map[string]interface{}, error) {
	body := map[string]interface{}{"agentConfig": agentConfig}
	resp, err := c.doRequest("POST", "/api/agent/compile", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return result, nil
}

// Status gets the workflow execution status
func (c *Client) Status(workflowID string) (map[string]interface{}, error) {
	resp, err := c.doRequest("GET", "/api/agent/"+workflowID+"/status", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return result, nil
}

// Respond sends a HITL response
func (c *Client) Respond(workflowID string, approved bool, reason, message string) error {
	body := map[string]interface{}{
		"approved": approved,
		"reason":   reason,
		"message":  message,
	}
	resp, err := c.doRequest("POST", "/api/agent/"+workflowID+"/respond", body)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// SSEEvent represents a server-sent event
type SSEEvent struct {
	ID    string
	Event string
	Data  string
}

// Stream opens an SSE connection and sends events to the channel
func (c *Client) Stream(workflowID string, lastEventID string, events chan<- SSEEvent, done chan<- error) {
	go func() {
		defer close(events)
		defer close(done)

		streamClient := &http.Client{Timeout: 0} // no timeout for SSE

		req, err := http.NewRequest("GET", c.baseURL+"/api/agent/stream/"+workflowID, nil)
		if err != nil {
			done <- err
			return
		}
		req.Header.Set("Accept", "text/event-stream")
		if lastEventID != "" {
			req.Header.Set("Last-Event-ID", lastEventID)
		}
		if c.authKey != "" {
			req.Header.Set("X-Auth-Key", c.authKey)
		}

		resp, err := streamClient.Do(req)
		if err != nil {
			done <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(resp.Body)
			done <- fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

		var current SSEEvent
		for scanner.Scan() {
			line := scanner.Text()

			if line == "" {
				// Empty line = end of event
				if current.Data != "" || current.Event != "" {
					events <- current
					current = SSEEvent{}
				}
				continue
			}

			if strings.HasPrefix(line, ":") {
				// Comment (heartbeat), skip
				continue
			}

			if strings.HasPrefix(line, "id:") {
				current.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
			} else if strings.HasPrefix(line, "event:") {
				current.Event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			} else if strings.HasPrefix(line, "data:") {
				current.Data = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			}
		}

		done <- scanner.Err()
	}()
}
