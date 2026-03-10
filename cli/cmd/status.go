package cmd

import (
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status <workflow-id>",
	Short: "Get the status of a running agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := getConfig()
		c := newClient(cfg)

		status, err := c.Status(args[0])
		if err != nil {
			return fmt.Errorf("failed to get status: %w", err)
		}

		wfStatus, _ := status["status"].(string)
		isRunning, _ := status["isRunning"].(bool)
		isComplete, _ := status["isComplete"].(bool)
		isWaiting, _ := status["isWaiting"].(bool)

		bold := color.New(color.Bold)
		bold.Printf("Workflow: %s\n", args[0])

		statusColor := color.FgWhite
		switch wfStatus {
		case "RUNNING":
			statusColor = color.FgYellow
		case "COMPLETED":
			statusColor = color.FgGreen
		case "FAILED", "TERMINATED", "TIMED_OUT":
			statusColor = color.FgRed
		}
		color.New(statusColor, color.Bold).Printf("Status: %s\n", wfStatus)

		if isRunning {
			fmt.Println("  Running: yes")
		}
		if isComplete {
			fmt.Println("  Complete: yes")
		}
		if isWaiting {
			color.Yellow("  Waiting for human input")
		}

		if output, ok := status["output"]; ok && output != nil {
			fmt.Printf("\nOutput:\n")
			printJSON(output)
		}

		if pending, ok := status["pendingTool"]; ok && pending != nil {
			fmt.Printf("\nPending Tool:\n")
			printJSON(pending)
		}

		return nil
	},
}

func init() {
	agentCmd.AddCommand(statusCmd)
}
