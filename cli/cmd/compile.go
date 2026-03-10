package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var compileCmd = &cobra.Command{
	Use:   "compile <config-file>",
	Short: "Compile an agent config to a Conductor workflow definition",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		agentConfig, err := loadAgentConfig(args[0])
		if err != nil {
			return err
		}

		cfg := getConfig()
		c := newClient(cfg)

		result, err := c.Compile(agentConfig)
		if err != nil {
			return fmt.Errorf("compilation failed: %w", err)
		}

		printJSON(result)
		return nil
	},
}

func init() {
	agentCmd.AddCommand(compileCmd)
}
