// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"fmt"
	"strings"

	"github.com/agentspan/agentspan/cli/client"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	runAgentName string
	runSessionID string
	runNoStream  bool
)

var runCmd = &cobra.Command{
	Use:   "run [prompt]",
	Short: "Start an agent and stream its output",
	Long: `Start a registered agent by name with a prompt,
and stream the execution events in real-time.

The agent must have been previously registered via the /api/agent/start endpoint.
Alternatively, provide a config file with --config.`,
	Args: cobra.MinimumNArgs(1),
	RunE: runAgent,
}

var runConfigFile string

func init() {
	runCmd.Flags().StringVar(&runAgentName, "name", "", "Name of a registered agent to run")
	runCmd.Flags().StringVar(&runConfigFile, "config", "", "Path to agent config file (YAML/JSON)")
	runCmd.Flags().StringVar(&runSessionID, "session", "", "Session ID for conversation continuity")
	runCmd.Flags().BoolVar(&runNoStream, "no-stream", false, "Don't stream events, just return the workflow ID")
	agentCmd.AddCommand(runCmd)
}

func runAgent(cmd *cobra.Command, args []string) error {
	prompt := strings.Join(args, " ")

	cfg := getConfig()
	c := newClient(cfg)

	var startReq *client.StartRequest

	if runConfigFile != "" {
		// Config file mode (existing behavior)
		agentConfig, err := loadAgentConfig(runConfigFile)
		if err != nil {
			return err
		}
		bold := color.New(color.Bold)
		bold.Printf("Starting agent: %s\n", agentConfig["name"])
		startReq = &client.StartRequest{
			AgentConfig: agentConfig,
			Prompt:      prompt,
		}
	} else if runAgentName != "" {
		// Name mode: fetch agent def, then start with it
		bold := color.New(color.Bold)
		bold.Printf("Starting agent: %s\n", runAgentName)

		agentDef, err := c.GetAgent(runAgentName, nil)
		if err != nil {
			return fmt.Errorf("failed to get agent '%s': %w", runAgentName, err)
		}
		startReq = &client.StartRequest{
			AgentConfig: agentDef,
			Prompt:      prompt,
		}
	} else {
		return fmt.Errorf("specify either --name or --config")
	}

	if runSessionID != "" {
		startReq.SessionID = runSessionID
	}

	resp, err := c.Start(startReq)
	if err != nil {
		return fmt.Errorf("failed to start agent: %w", err)
	}

	fmt.Printf("Workflow: %s (ID: %s)\n", resp.WorkflowName, resp.WorkflowID)

	if runNoStream {
		return nil
	}

	fmt.Println()
	return streamWorkflow(c, resp.WorkflowID)
}

func streamWorkflow(c *client.Client, workflowID string) error {
	events := make(chan client.SSEEvent, 100)
	done := make(chan error, 1)

	c.Stream(workflowID, "", events, done)

	for {
		select {
		case evt, ok := <-events:
			if !ok {
				return nil
			}
			printSSEEvent(evt)
		case err := <-done:
			return err
		}
	}
}
