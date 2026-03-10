package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var streamLastEventID string

var streamCmd = &cobra.Command{
	Use:   "stream <workflow-id>",
	Short: "Stream events from a running agent",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := getConfig()
		c := newClient(cfg)

		workflowID := args[0]
		fmt.Printf("Streaming events for %s...\n\n", workflowID)

		return streamWorkflow(c, workflowID)
	},
}

func init() {
	streamCmd.Flags().StringVar(&streamLastEventID, "last-event-id", "", "Resume from a specific event ID")
	agentCmd.AddCommand(streamCmd)
}
