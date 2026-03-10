// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

const cliRepo = "agentspan/agentspan"

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update the CLI to the latest version",
	RunE: func(cmd *cobra.Command, args []string) error {
		goos := runtime.GOOS
		goarch := runtime.GOARCH

		binaryName := fmt.Sprintf("agentspan_%s_%s", goos, goarch)
		if goos == "windows" {
			binaryName += ".exe"
		}

		downloadURL := fmt.Sprintf("https://github.com/%s/releases/latest/download/%s", cliRepo, binaryName)

		color.Yellow("Downloading latest CLI...")
		fmt.Printf("  URL: %s\n", downloadURL)

		httpClient := &http.Client{Timeout: 5 * time.Minute}
		resp, err := httpClient.Get(downloadURL)
		if err != nil {
			return fmt.Errorf("download failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
		}

		// Find current executable path
		execPath, err := os.Executable()
		if err != nil {
			return fmt.Errorf("find executable path: %w", err)
		}

		// Write to temp file
		tmpPath := execPath + ".new"
		f, err := os.Create(tmpPath)
		if err != nil {
			return fmt.Errorf("create temp file: %w", err)
		}

		_, err = io.Copy(f, resp.Body)
		f.Close()
		if err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("write binary: %w", err)
		}

		// Make executable
		if err := os.Chmod(tmpPath, 0o755); err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("chmod: %w", err)
		}

		// Replace current executable
		if err := os.Rename(tmpPath, execPath); err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("replace binary: %w", err)
		}

		color.Green("Updated successfully!")
		fmt.Println("Run 'agentspan version' to see the new version.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}
