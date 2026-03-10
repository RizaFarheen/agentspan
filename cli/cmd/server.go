// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/agentspan/agentspan/cli/config"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

const (
	githubRepo = "agentspan/agentspan"
	latestTag  = "latest"
	jarName    = "agentspan-runtime.jar"
)

var (
	serverPort    string
	serverModel   string
	serverVersion string
	followLogs    bool
)

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Manage the agent runtime server",
}

var serverStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Download (if needed) and start the agent runtime server",
	RunE:  runServerStart,
}

var serverStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the running agent runtime server",
	RunE:  runServerStop,
}

var serverLogsCmd = &cobra.Command{
	Use:   "logs",
	Short: "Show server logs",
	RunE:  runServerLogs,
}

func init() {
	serverStartCmd.Flags().StringVarP(&serverPort, "port", "p", "8080", "Server port")
	serverStartCmd.Flags().StringVarP(&serverModel, "model", "m", "", "Default LLM model (e.g. openai/gpt-4o)")
	serverStartCmd.Flags().StringVar(&serverVersion, "version", "", "Specific server version to download (e.g. 0.1.0)")

	serverLogsCmd.Flags().BoolVarP(&followLogs, "follow", "f", false, "Follow log output")

	serverCmd.AddCommand(serverStartCmd, serverStopCmd, serverLogsCmd)
	rootCmd.AddCommand(serverCmd)
}

func serverDir() string {
	return filepath.Join(config.ConfigDir(), "server")
}

func pidFile() string {
	return filepath.Join(serverDir(), "server.pid")
}

func logFile() string {
	return filepath.Join(serverDir(), "server.log")
}

func metadataFile() string {
	return filepath.Join(serverDir(), "latest.json")
}

type releaseMetadata struct {
	ETag      string `json:"etag"`
	UpdatedAt string `json:"updated_at"`
	Version   string `json:"version"`
}

func runServerStart(cmd *cobra.Command, args []string) error {
	dir := serverDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create server dir: %w", err)
	}

	var jarPath string
	if serverVersion != "" {
		jarPath = filepath.Join(dir, fmt.Sprintf("agentspan-runtime-%s.jar", serverVersion))
		if err := ensureVersionedJAR(jarPath, serverVersion); err != nil {
			return err
		}
	} else {
		jarPath = filepath.Join(dir, jarName)
		if err := ensureLatestJAR(jarPath); err != nil {
			return err
		}
	}

	// Check if already running
	if pid, err := readPID(); err == nil {
		if processRunning(pid) {
			color.Yellow("Server already running (PID %d). Stop it first with: agentspan server stop", pid)
			return nil
		}
		// Stale PID file
		os.Remove(pidFile())
	}

	bold := color.New(color.Bold)
	bold.Printf("Starting agent runtime on port %s...\n", serverPort)

	// Build java args
	javaArgs := []string{"-jar", jarPath}

	env := os.Environ()
	if serverPort != "8080" {
		env = append(env, "SERVER_PORT="+serverPort)
	}
	if serverModel != "" {
		env = append(env, "AGENT_DEFAULT_MODEL="+serverModel)
	}

	// Open log file
	logF, err := os.OpenFile(logFile(), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}

	proc := exec.Command("java", javaArgs...)
	proc.Env = env
	proc.Stdout = logF
	proc.Stderr = logF
	proc.SysProcAttr = sysProcAttr()

	if err := proc.Start(); err != nil {
		logF.Close()
		return fmt.Errorf("failed to start server: %w", err)
	}

	// Write PID
	pid := proc.Process.Pid
	if err := os.WriteFile(pidFile(), []byte(strconv.Itoa(pid)), 0o644); err != nil {
		logF.Close()
		return fmt.Errorf("write PID file: %w", err)
	}

	// Detach - release the process so CLI can exit
	proc.Process.Release()
	logF.Close()

	color.Green("Server started (PID %d)", pid)
	fmt.Printf("  Logs: %s\n", logFile())
	fmt.Printf("  URL:  http://localhost:%s\n", serverPort)
	fmt.Println("\nUse 'agentspan server logs -f' to follow output.")
	return nil
}

func runServerStop(cmd *cobra.Command, args []string) error {
	pid, err := readPID()
	if err != nil {
		color.Yellow("No server PID file found. Server may not be running.")
		return nil
	}

	if !processRunning(pid) {
		os.Remove(pidFile())
		color.Yellow("Server process (PID %d) is not running. Cleaned up stale PID file.", pid)
		return nil
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("find process %d: %w", pid, err)
	}

	if err := killProcess(process); err != nil {
		return fmt.Errorf("stop process %d: %w", pid, err)
	}

	os.Remove(pidFile())
	color.Green("Server stopped (PID %d)", pid)
	return nil
}

func runServerLogs(cmd *cobra.Command, args []string) error {
	path := logFile()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("no log file found at %s", path)
	}

	if !followLogs {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		fmt.Print(string(data))
		return nil
	}

	// Follow mode: tail -f style
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Seek to end
	f.Seek(0, io.SeekEnd)

	buf := make([]byte, 4096)
	for {
		n, err := f.Read(buf)
		if n > 0 {
			fmt.Print(string(buf[:n]))
		}
		if err == io.EOF {
			time.Sleep(200 * time.Millisecond)
			continue
		}
		if err != nil {
			return err
		}
	}
}

// --- JAR download helpers ---

func ensureVersionedJAR(jarPath, version string) error {
	if _, err := os.Stat(jarPath); err == nil {
		color.Green("Using cached JAR for version %s", version)
		return nil
	}

	tag := "server-v" + version
	asset := fmt.Sprintf("agentspan-runtime-%s.jar", version)
	downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", githubRepo, tag, asset)

	return downloadJAR(downloadURL, jarPath)
}

func ensureLatestJAR(jarPath string) error {
	// Check GitHub for latest release metadata
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/%s", githubRepo, latestTag)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return checkFallback(jarPath, err)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	// Use If-None-Match if we have a cached etag
	var cached releaseMetadata
	if data, err := os.ReadFile(metadataFile()); err == nil {
		json.Unmarshal(data, &cached)
		if cached.ETag != "" {
			req.Header.Set("If-None-Match", cached.ETag)
		}
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return checkFallback(jarPath, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		// Latest hasn't changed
		if _, err := os.Stat(jarPath); err == nil {
			color.Green("Server JAR is up to date")
			return nil
		}
	}

	if resp.StatusCode != http.StatusOK {
		return checkFallback(jarPath, fmt.Errorf("GitHub API returned %d", resp.StatusCode))
	}

	// Parse release to find the JAR asset URL
	var release struct {
		Assets []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
			UpdatedAt          string `json:"updated_at"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return checkFallback(jarPath, err)
	}

	var assetURL, updatedAt string
	for _, a := range release.Assets {
		if a.Name == jarName {
			assetURL = a.BrowserDownloadURL
			updatedAt = a.UpdatedAt
			break
		}
	}
	if assetURL == "" {
		return checkFallback(jarPath, fmt.Errorf("JAR asset not found in latest release"))
	}

	// Check if we need to re-download
	if cached.UpdatedAt == updatedAt {
		if _, err := os.Stat(jarPath); err == nil {
			color.Green("Server JAR is up to date")
			return nil
		}
	}

	// Download
	if err := downloadJAR(assetURL, jarPath); err != nil {
		return err
	}

	// Save metadata
	meta := releaseMetadata{
		ETag:      resp.Header.Get("ETag"),
		UpdatedAt: updatedAt,
	}
	if data, err := json.Marshal(meta); err == nil {
		os.WriteFile(metadataFile(), data, 0o644)
	}

	return nil
}

func checkFallback(jarPath string, origErr error) error {
	if _, err := os.Stat(jarPath); err == nil {
		color.Yellow("Could not check for updates (%v), using cached JAR", origErr)
		return nil
	}
	return fmt.Errorf("download server JAR: %w", origErr)
}

func downloadJAR(downloadURL, destPath string) error {
	color.Yellow("Downloading server JAR...")
	fmt.Printf("  URL: %s\n", downloadURL)

	httpClient := &http.Client{
		Timeout: 10 * time.Minute,
	}

	resp, err := httpClient.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	// Write to temp file first, then rename
	tmpPath := destPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}

	written, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("write JAR: %w", err)
	}

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename JAR: %w", err)
	}

	color.Green("Downloaded %.1f MB", float64(written)/1024/1024)
	return nil
}

// --- PID helpers ---

func readPID() (int, error) {
	data, err := os.ReadFile(pidFile())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

