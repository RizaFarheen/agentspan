// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.

package cmd

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/agentspan/agentspan/cli/config"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

// Deploy command flags
var (
	deployName       string
	deployVersion    string
	deployLanguage   string
	deployEntryPoint string
	deployRuntime    string
	deployAutoStart  bool
	deployCPU        string
	deployMemory     string
	deployReplicas   int
	deployTimeout    int
	deployYes        bool
	deployDir        string
	deployDryRun     bool
)

// DeployLock is the structure of .agentspan/deploy.lock
type DeployLock struct {
	Name           string    `json:"name"`
	CurrentVersion string    `json:"current_version"`
	Language       string    `json:"language"`
	EntryPoint     string    `json:"entry_point"`
	RuntimeVersion string    `json:"runtime_version"`
	LastDeployID   string    `json:"last_deploy_id,omitempty"`
	LastDeployedAt time.Time `json:"last_deployed_at,omitempty"`
	ContentHash    string    `json:"content_hash,omitempty"`
}

// Manifest is the deployment manifest included in the tar
type Manifest struct {
	ManifestVersion string         `json:"manifest_version"`
	Name            string         `json:"name"`
	Version         string         `json:"version"`
	Language        string         `json:"language"`
	RuntimeVersion  string         `json:"runtime_version"`
	EntryPoint      string         `json:"entry_point"`
	AutoStart       bool           `json:"auto_start"`
	Resources       ResourceConfig `json:"resources"`
	Metadata        ManifestMeta   `json:"metadata,omitempty"`
}

// ResourceConfig holds resource allocation settings
type ResourceConfig struct {
	CPURequest    string `json:"cpu_request"`
	CPULimit      string `json:"cpu_limit"`
	MemoryRequest string `json:"memory_request"`
	MemoryLimit   string `json:"memory_limit"`
	Replicas      int    `json:"replicas"`
	Timeout       int    `json:"timeout"`
}

// ManifestMeta holds auto-generated metadata
type ManifestMeta struct {
	CLIVersion string    `json:"cli_version,omitempty"`
	CreatedAt  time.Time `json:"created_at,omitempty"`
	GitSHA     string    `json:"git_sha,omitempty"`
}

// UploadResponse from the ingest service
type UploadResponse struct {
	DeployID  string `json:"deploy_id"`
	StreamURL string `json:"stream_url"`
	RequestID string `json:"request_id"`
}

// Hardcoded exclusions for tar creation
var defaultExclusions = []string{
	// Version control
	".git",
	".gitignore",
	".gitattributes",
	".svn",
	".hg",

	// AgentSpan state
	".agentspan",

	// Python
	"__pycache__",
	"*.pyc",
	"*.pyo",
	"*.pyd",
	".pytest_cache",
	".mypy_cache",
	".ruff_cache",
	".tox",
	".nox",
	".eggs",
	"*.egg-info",
	".venv",
	"venv",
	"env",

	// Secrets
	".env",
	".env.*",
	"*.pem",
	"*.key",

	// Node/TypeScript
	"node_modules",
	".npm",
	".yarn",
	"dist",
	"build",

	// Java
	"target",
	"*.class",
	"*.jar",
	".gradle",

	// IDE
	".idea",
	".vscode",
	"*.swp",
	"*.swo",

	// OS
	".DS_Store",
	"Thumbs.db",

	// Logs
	"*.log",
	"logs",
}

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Deploy agent code to the AgentSpan runtime",
	Long: `Package and deploy agent code to the AgentSpan runtime.

This command:
1. Detects the project language (Python, TypeScript, Java)
2. Creates a deployment manifest
3. Packages the code into a tar.gz archive
4. Uploads to the ingest service
5. Streams deployment progress via SSE

Example:
  agentspan deploy                          # Interactive prompts
  agentspan deploy -n my-agent -y           # Non-interactive with name
  agentspan deploy --dry-run                # Create tar without uploading
`,
	RunE: runDeploy,
}

func init() {
	deployCmd.Flags().StringVarP(&deployName, "name", "n", "", "Agent name (DNS-compatible)")
	deployCmd.Flags().StringVarP(&deployVersion, "version", "v", "", "Version (default: auto-bump)")
	deployCmd.Flags().StringVarP(&deployLanguage, "language", "l", "", "Language: python, typescript, java")
	deployCmd.Flags().StringVarP(&deployEntryPoint, "entry-point", "e", "", "Entry point file")
	deployCmd.Flags().StringVarP(&deployRuntime, "runtime", "r", "", "Runtime version (e.g., 3.11 for Python)")
	deployCmd.Flags().BoolVarP(&deployAutoStart, "auto-start", "a", true, "Auto-start after build")
	deployCmd.Flags().StringVar(&deployCPU, "cpu", "100m", "CPU request")
	deployCmd.Flags().StringVar(&deployMemory, "memory", "256Mi", "Memory request")
	deployCmd.Flags().IntVar(&deployReplicas, "replicas", 1, "Number of replicas")
	deployCmd.Flags().IntVar(&deployTimeout, "timeout", 300, "Timeout in seconds")
	deployCmd.Flags().BoolVarP(&deployYes, "yes", "y", false, "Skip all prompts")
	deployCmd.Flags().StringVarP(&deployDir, "dir", "d", ".", "Source directory")
	deployCmd.Flags().BoolVar(&deployDryRun, "dry-run", false, "Generate manifest and tar without uploading")

	agentCmd.AddCommand(deployCmd)
}

func runDeploy(cmd *cobra.Command, args []string) error {
	// Resolve source directory
	srcDir, err := filepath.Abs(deployDir)
	if err != nil {
		return fmt.Errorf("resolve directory: %w", err)
	}

	// Load existing lock file
	lock, err := loadDeployLock(srcDir)
	if err != nil {
		return err
	}

	// Detect language
	language := deployLanguage
	if language == "" {
		if lock != nil && lock.Language != "" {
			language = lock.Language
		} else {
			detected, err := detectLanguage(srcDir)
			if err != nil {
				return err
			}
			language = detected
		}
	}
	color.New(color.FgCyan).Printf("Language: %s\n", language)

	// Determine entry point
	entryPoint := deployEntryPoint
	if entryPoint == "" {
		if lock != nil && lock.EntryPoint != "" {
			entryPoint = lock.EntryPoint
		} else {
			entryPoint = defaultEntryPoint(language)
		}
	}

	// Validate entry point exists
	if !fileExists(filepath.Join(srcDir, entryPoint)) {
		return fmt.Errorf("entry point '%s' not found in %s", entryPoint, srcDir)
	}
	color.New(color.FgCyan).Printf("Entry point: %s\n", entryPoint)

	// Determine runtime version
	runtime := deployRuntime
	if runtime == "" {
		if lock != nil && lock.RuntimeVersion != "" {
			runtime = lock.RuntimeVersion
		} else {
			runtime = defaultRuntime(language)
		}
	}
	color.New(color.FgCyan).Printf("Runtime: %s\n", runtime)

	// Determine agent name
	name := deployName
	if name == "" {
		if lock != nil && lock.Name != "" {
			name = lock.Name
		} else if !deployYes {
			// Prompt for name
			fmt.Print("Agent name: ")
			var input string
			fmt.Scanln(&input)
			name = strings.TrimSpace(input)
		}
	}
	if name == "" {
		// Use directory name as default
		name = filepath.Base(srcDir)
	}
	// Validate DNS-compatible name
	if !isValidDNSName(name) {
		return fmt.Errorf("agent name '%s' is not DNS-compatible (lowercase, alphanumeric, hyphens only)", name)
	}
	color.New(color.FgCyan).Printf("Agent name: %s\n", name)

	// Calculate version
	version := calculateNextVersion(lock, deployVersion)
	color.New(color.FgCyan).Printf("Version: %s\n", version)

	// Build manifest
	manifest := &Manifest{
		ManifestVersion: "1.0",
		Name:            name,
		Version:         version,
		Language:        language,
		RuntimeVersion:  runtime,
		EntryPoint:      entryPoint,
		AutoStart:       deployAutoStart,
		Resources: ResourceConfig{
			CPURequest:    deployCPU,
			CPULimit:      deployCPU, // Same as request for now
			MemoryRequest: deployMemory,
			MemoryLimit:   deployMemory,
			Replicas:      deployReplicas,
			Timeout:       deployTimeout,
		},
		Metadata: ManifestMeta{
			CLIVersion: Version,
			CreatedAt:  time.Now().UTC(),
			GitSHA:     getGitSHA(srcDir),
		},
	}

	// Create tar.gz
	tarPath, err := createTar(srcDir, manifest)
	if err != nil {
		return fmt.Errorf("create tar: %w", err)
	}
	defer os.Remove(tarPath)

	tarInfo, _ := os.Stat(tarPath)
	color.New(color.FgGreen).Printf("Created package: %s (%d bytes)\n", filepath.Base(tarPath), tarInfo.Size())

	if deployDryRun {
		// Copy tar to current directory for inspection
		dstPath := fmt.Sprintf("%s-%s.tar.gz", name, version)
		if err := copyFile(tarPath, dstPath); err != nil {
			return err
		}
		color.New(color.FgYellow).Printf("Dry run: package saved to %s\n", dstPath)
		return nil
	}

	// Upload to ingest service
	cfg := config.Load()
	if serverURL != "" {
		cfg.ServerURL = serverURL
	}

	// Derive ingest URL from server URL
	ingestURL := deriveIngestURL(cfg.ServerURL)
	color.New(color.FgCyan).Printf("Uploading to: %s\n", ingestURL)

	uploadResp, err := uploadPackage(ingestURL, tarPath, cfg)
	if err != nil {
		return fmt.Errorf("upload failed: %w", err)
	}

	color.New(color.FgGreen).Printf("Deploy ID: %s\n", uploadResp.DeployID)

	// Update lock file
	newLock := &DeployLock{
		Name:           name,
		CurrentVersion: version,
		Language:       language,
		EntryPoint:     entryPoint,
		RuntimeVersion: runtime,
		LastDeployID:   uploadResp.DeployID,
		LastDeployedAt: time.Now().UTC(),
	}
	if err := saveDeployLock(srcDir, newLock); err != nil {
		color.New(color.FgYellow).Printf("Warning: failed to save deploy.lock: %v\n", err)
	}

	// Stream deployment progress
	streamURL := ingestURL + uploadResp.StreamURL
	return streamDeployProgress(streamURL, cfg)
}

func loadDeployLock(srcDir string) (*DeployLock, error) {
	lockPath := filepath.Join(srcDir, ".agentspan", "deploy.lock")
	data, err := os.ReadFile(lockPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var lock DeployLock
	if err := json.Unmarshal(data, &lock); err != nil {
		// Corrupted lock - treat as first deploy
		color.New(color.FgYellow).Println("Warning: deploy.lock is corrupted, treating as first deploy")
		return nil, nil
	}
	return &lock, nil
}

func saveDeployLock(srcDir string, lock *DeployLock) error {
	lockDir := filepath.Join(srcDir, ".agentspan")
	if err := os.MkdirAll(lockDir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(lockDir, "deploy.lock"), data, 0644)
}

func detectLanguage(dir string) (string, error) {
	var found []string

	if fileExists(filepath.Join(dir, "requirements.txt")) ||
		fileExists(filepath.Join(dir, "pyproject.toml")) {
		found = append(found, "python")
	}
	if fileExists(filepath.Join(dir, "package.json")) {
		found = append(found, "typescript")
	}
	if fileExists(filepath.Join(dir, "pom.xml")) ||
		fileExists(filepath.Join(dir, "build.gradle")) ||
		fileExists(filepath.Join(dir, "build.gradle.kts")) {
		found = append(found, "java")
	}

	if len(found) == 0 {
		return "", fmt.Errorf("no supported language detected (need requirements.txt, pyproject.toml, package.json, pom.xml, or build.gradle)")
	}
	if len(found) > 1 {
		return "", fmt.Errorf("multiple languages detected (%s), use --language flag", strings.Join(found, ", "))
	}
	return found[0], nil
}

func defaultEntryPoint(language string) string {
	switch language {
	case "python":
		return "agent.py"
	case "typescript":
		return "src/agent.ts"
	case "java":
		return "src/main/java/Agent.java"
	default:
		return "agent.py"
	}
}

func defaultRuntime(language string) string {
	switch language {
	case "python":
		return "3.11"
	case "typescript":
		return "20"
	case "java":
		return "21"
	default:
		return "3.11"
	}
}

func calculateNextVersion(lock *DeployLock, userVersion string) string {
	if userVersion != "" {
		return userVersion
	}
	if lock == nil || lock.CurrentVersion == "" {
		return "1.0.0"
	}
	return bumpPatch(lock.CurrentVersion)
}

func bumpPatch(version string) string {
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return "1.0.0"
	}
	patch, err := strconv.Atoi(parts[2])
	if err != nil {
		return "1.0.0"
	}
	return fmt.Sprintf("%s.%s.%d", parts[0], parts[1], patch+1)
}

func isValidDNSName(name string) bool {
	// DNS-compatible: lowercase, alphanumeric, hyphens, max 63 chars
	if len(name) == 0 || len(name) > 63 {
		return false
	}
	matched, _ := regexp.MatchString("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", name)
	return matched
}

func getGitSHA(dir string) string {
	headPath := filepath.Join(dir, ".git", "HEAD")
	data, err := os.ReadFile(headPath)
	if err != nil {
		return ""
	}
	content := strings.TrimSpace(string(data))
	if strings.HasPrefix(content, "ref: ") {
		refPath := filepath.Join(dir, ".git", strings.TrimPrefix(content, "ref: "))
		refData, err := os.ReadFile(refPath)
		if err != nil {
			return ""
		}
		content = strings.TrimSpace(string(refData))
	}
	if len(content) >= 7 {
		return content[:7]
	}
	return content
}

func createTar(sourceDir string, manifest *Manifest) (string, error) {
	tmpFile, err := os.CreateTemp("", "agentspan-deploy-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}

	gzWriter := gzip.NewWriter(tmpFile)
	tarWriter := tar.NewWriter(gzWriter)

	// Write manifest.json FIRST
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
	if err := tarWriter.WriteHeader(&tar.Header{
		Name:    "manifest.json",
		Size:    int64(len(manifestBytes)),
		Mode:    0644,
		ModTime: time.Now(),
	}); err != nil {
		return "", err
	}
	if _, err := tarWriter.Write(manifestBytes); err != nil {
		return "", err
	}

	// Walk and add remaining files
	err = filepath.Walk(sourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(sourceDir, path)
		if relPath == "." {
			return nil
		}

		// Check exclusions
		if shouldExclude(relPath, info.IsDir()) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Handle symlinks
		if info.Mode()&os.ModeSymlink != 0 {
			realPath, err := filepath.EvalSymlinks(path)
			if err != nil {
				return err
			}
			info, err = os.Stat(realPath)
			if err != nil {
				return err
			}
		}

		// Create header with normalized permissions
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		// Normalize permissions
		if info.IsDir() {
			header.Mode = 0755
		} else {
			header.Mode = 0644
		}

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()
			_, err = io.Copy(tarWriter, file)
			if err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", err
	}

	tarWriter.Close()
	gzWriter.Close()
	tmpFile.Close()

	return tmpFile.Name(), nil
}

func shouldExclude(path string, isDir bool) bool {
	base := filepath.Base(path)

	for _, pattern := range defaultExclusions {
		// Check if pattern has glob
		if strings.Contains(pattern, "*") {
			matched, _ := filepath.Match(pattern, base)
			if matched {
				return true
			}
		} else {
			// Exact match
			if base == pattern {
				return true
			}
			// Check if any path component matches
			parts := strings.Split(path, string(filepath.Separator))
			for _, part := range parts {
				if part == pattern {
					return true
				}
			}
		}
	}
	return false
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func deriveIngestURL(serverURL string) string {
	// For local development, use port 8081
	if strings.Contains(serverURL, "localhost") || strings.Contains(serverURL, "127.0.0.1") {
		return "http://localhost:8081"
	}
	// For production, use same host with /v1/ingest path
	return strings.TrimRight(serverURL, "/")
}

func uploadPackage(ingestURL, tarPath string, cfg *config.Config) (*UploadResponse, error) {
	file, err := os.Open(tarPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	req, err := http.NewRequest("POST", ingestURL+"/v1/ingest", file)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/octet-stream")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	} else {
		if cfg.AuthKey != "" {
			req.Header.Set("X-Auth-Key", cfg.AuthKey)
		}
		if cfg.AuthSecret != "" {
			req.Header.Set("X-Auth-Secret", cfg.AuthSecret)
		}
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result UploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

func streamDeployProgress(streamURL string, cfg *config.Config) error {
	req, err := http.NewRequest("GET", streamURL, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "text/event-stream")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}

	client := &http.Client{Timeout: 0} // No timeout for SSE
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("connect to stream: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	var eventType, eventData string

	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			// End of event, process it
			if eventData != "" {
				printDeployEvent(eventType, eventData)
				eventType, eventData = "", ""
			}
			continue
		}

		if strings.HasPrefix(line, ":") {
			// Comment/keepalive, ignore
			continue
		}

		if strings.HasPrefix(line, "event:") {
			eventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			eventData = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}

	return scanner.Err()
}

func printDeployEvent(eventType, data string) {
	var evt map[string]interface{}
	if err := json.Unmarshal([]byte(data), &evt); err != nil {
		// Not JSON
		fmt.Printf("[%s] %s\n", eventType, data)
		return
	}

	stage, _ := evt["stage"].(string)
	message, _ := evt["message"].(string)
	progress, _ := evt["progress"].(float64)

	switch eventType {
	case "progress":
		color.New(color.FgCyan).Printf("  [%s] %s (%d%%)\n", stage, message, int(progress))
	case "log":
		color.New(color.FgHiBlack).Printf("  %s\n", message)
	case "error":
		errMsg := ""
		if errData, ok := evt["data"].(map[string]interface{}); ok {
			errMsg, _ = errData["error"].(string)
		}
		color.New(color.FgRed, color.Bold).Printf("  [%s] %s: %s\n", stage, message, errMsg)
	case "complete":
		if stage == "deploy_complete" {
			color.New(color.FgGreen, color.Bold).Println("\n✓ Deployment complete!")
			if deployData, ok := evt["data"].(map[string]interface{}); ok {
				if deployID, ok := deployData["deploy_id"].(string); ok {
					fmt.Printf("  Deploy ID: %s\n", deployID)
				}
				if workflowID, ok := deployData["workflow_id"].(string); ok {
					fmt.Printf("  Workflow ID: %s\n", workflowID)
				}
			}
		} else {
			color.New(color.FgGreen).Printf("  [%s] Complete\n", stage)
		}
	default:
		fmt.Printf("  [%s] %s\n", eventType, truncate(data, 100))
	}
}
