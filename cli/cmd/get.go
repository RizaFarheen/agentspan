// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var getVersion int

var getCmd = &cobra.Command{
	Use:   "get <name>",
	Short: "Get agent configuration in JSON format",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := getConfig()
		c := newClient(cfg)

		var versionPtr *int
		if cmd.Flags().Changed("version") {
			versionPtr = &getVersion
		}

		result, err := c.GetAgent(args[0], versionPtr)
		if err != nil {
			return fmt.Errorf("failed to get agent: %w", err)
		}

		printJSON(result)
		return nil
	},
}

func init() {
	getCmd.Flags().IntVar(&getVersion, "version", 0, "Agent version (default: latest)")
	agentCmd.AddCommand(getCmd)
}
