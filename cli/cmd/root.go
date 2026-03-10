package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var serverURL string

var rootCmd = &cobra.Command{
	Use:   "openagent",
	Short: "CLI for the OpenAgent runtime",
	Long:  "Create, run, and manage AI agents powered by the OpenAgent runtime.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVar(&serverURL, "server", "", "Runtime server URL (default: http://localhost:8080)")
}
