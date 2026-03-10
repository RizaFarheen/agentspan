package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	serverPort     string
	serverModel    string
	runtimeDir     string
	conductorProps string
)

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Manage the agent runtime server",
}

var serverStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the agent runtime server",
	Long:  "Build and start the Java agent runtime server. Requires Java 17+ and Gradle.",
	RunE:  runServerStart,
}

var serverBuildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build the runtime server JAR",
	RunE:  runServerBuild,
}

var serverStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check if the runtime server is running",
	RunE:  runServerStatus,
}

func init() {
	serverStartCmd.Flags().StringVarP(&serverPort, "port", "p", "8080", "Server port")
	serverStartCmd.Flags().StringVarP(&serverModel, "model", "m", "", "Default LLM model (e.g. openai/gpt-4o)")
	serverStartCmd.Flags().StringVarP(&runtimeDir, "runtime-dir", "d", "", "Path to runtime directory (auto-detected if not set)")
	serverStartCmd.Flags().StringVar(&conductorProps, "conductor-properties", "", "Path to conductor.properties file")

	serverBuildCmd.Flags().StringVarP(&runtimeDir, "runtime-dir", "d", "", "Path to runtime directory")

	serverCmd.AddCommand(serverStartCmd, serverBuildCmd, serverStatusCmd)
	rootCmd.AddCommand(serverCmd)
}

func findRuntimeDir() (string, error) {
	if runtimeDir != "" {
		return runtimeDir, nil
	}

	// Try relative to CWD
	candidates := []string{
		"runtime",
		"../runtime",
		filepath.Join(os.Getenv("HOME"), "workspace/github/orkes/sdk/agent-sdk/runtime"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "build.gradle")); err == nil {
			abs, _ := filepath.Abs(c)
			return abs, nil
		}
	}
	return "", fmt.Errorf("runtime directory not found; specify with --runtime-dir")
}

func runServerBuild(cmd *cobra.Command, args []string) error {
	dir, err := findRuntimeDir()
	if err != nil {
		return err
	}

	bold := color.New(color.Bold)
	bold.Printf("Building runtime in %s...\n", dir)

	gradlew := filepath.Join(dir, "gradlew")
	build := exec.Command(gradlew, "build", "-x", "test")
	build.Dir = dir
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr

	if err := build.Run(); err != nil {
		return fmt.Errorf("build failed: %w", err)
	}

	color.Green("Build successful!")
	return nil
}

func runServerStart(cmd *cobra.Command, args []string) error {
	dir, err := findRuntimeDir()
	if err != nil {
		return err
	}

	jarPath := filepath.Join(dir, "build", "libs", "agent-runtime.jar")
	if _, err := os.Stat(jarPath); os.IsNotExist(err) {
		color.Yellow("JAR not found, building first...")
		runtimeDir = dir
		if err := runServerBuild(cmd, args); err != nil {
			return err
		}
	}

	env := os.Environ()
	if serverPort != "8080" {
		env = append(env, "SERVER_PORT="+serverPort)
	}
	if serverModel != "" {
		env = append(env, "AGENT_DEFAULT_MODEL="+serverModel)
	}

	javaArgs := []string{"-jar", jarPath}
	if conductorProps != "" {
		absProps, _ := filepath.Abs(conductorProps)
		javaArgs = append(javaArgs, "--spring.config.additional-location=file:"+absProps)
	}

	bold := color.New(color.Bold)
	bold.Printf("Starting agent runtime on port %s...\n", serverPort)

	proc := exec.Command("java", javaArgs...)
	proc.Dir = dir
	proc.Env = env
	proc.Stdout = os.Stdout
	proc.Stderr = os.Stderr

	if err := proc.Start(); err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}

	// Handle signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		color.Yellow("\nShutting down server...")
		proc.Process.Signal(syscall.SIGTERM)
	}()

	return proc.Wait()
}

func runServerStatus(cmd *cobra.Command, args []string) error {
	cfg := getConfig()
	c := newClient(cfg)

	if err := c.HealthCheck(); err != nil {
		color.Red("Server is not reachable at %s", cfg.ServerURL)
		return err
	}

	color.Green("Server is running at %s", cfg.ServerURL)
	return nil
}
