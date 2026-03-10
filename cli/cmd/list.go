// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all registered agents",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg := getConfig()
		c := newClient(cfg)

		agents, err := c.ListAgents()
		if err != nil {
			return fmt.Errorf("failed to list agents: %w", err)
		}

		if len(agents) == 0 {
			color.Yellow("No agents registered.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "NAME\tVERSION\tTYPE\tDESCRIPTION\tUPDATED")
		fmt.Fprintln(w, "----\t-------\t----\t-----------\t-------")

		for _, a := range agents {
			updated := ""
			if a.UpdateTime != nil {
				t := time.UnixMilli(*a.UpdateTime)
				updated = t.Format("2006-01-02 15:04")
			}
			desc := truncate(a.Description, 40)
			fmt.Fprintf(w, "%s\t%d\t%s\t%s\t%s\n", a.Name, a.Version, a.Type, desc, updated)
		}
		w.Flush()

		fmt.Printf("\n%d agent(s) found.\n", len(agents))
		return nil
	},
}

func init() {
	agentCmd.AddCommand(listCmd)
}
