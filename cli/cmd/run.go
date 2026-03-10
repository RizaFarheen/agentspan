package cmd

import (
	"fmt"

	"github.com/fatih/color"
	"github.com/openagent/cli/client"
	"github.com/spf13/cobra"
)

var (
	runSessionID string
	runNoStream  bool
)

var runCmd = &cobra.Command{
	Use:   "run <config-file> <prompt>",
	Short: "Start an agent and stream its output",
	Long: `Start an agent from a YAML/JSON config file with a prompt,
and stream the execution events in real-time.`,
	Args: cobra.ExactArgs(2),
	RunE: runAgent,
}

func init() {
	runCmd.Flags().StringVar(&runSessionID, "session", "", "Session ID for conversation continuity")
	runCmd.Flags().BoolVar(&runNoStream, "no-stream", false, "Don't stream events, just return the workflow ID")
	agentCmd.AddCommand(runCmd)
}

func runAgent(cmd *cobra.Command, args []string) error {
	configFile := args[0]
	prompt := args[1]

	agentConfig, err := loadAgentConfig(configFile)
	if err != nil {
		return err
	}

	cfg := getConfig()
	c := newClient(cfg)

	bold := color.New(color.Bold)
	bold.Printf("Starting agent: %s\n", agentConfig["name"])

	startReq := &client.StartRequest{
		AgentConfig: agentConfig,
		Prompt:      prompt,
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
