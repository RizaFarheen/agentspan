# AgentSpan CLI

Command-line interface for building, running, and managing AI agents powered by the AgentSpan runtime.

## Install

### npm (recommended)

```bash
npm install -g @agentspan/agentspan
```

### Homebrew

```bash
brew tap agentspan/agentspan
brew install agentspan
```

### Shell script

```bash
curl -fsSL https://raw.githubusercontent.com/agentspan/agentspan/main/cli/install.sh | sh
```

### From source

```bash
cd cli
go build -o agentspan .
```

## Quickstart

```bash
# Start the runtime server (downloads automatically)
agentspan server start

# Create an agent config
agentspan agent init mybot

# Run an agent from a config file
agentspan agent run --config mybot.yaml "What is the weather in NYC?"

# Run a registered agent by name
agentspan agent run --name mybot "What is the weather in NYC?"
```

## Commands

### Server Management

```bash
# Start the server (downloads latest JAR if needed)
agentspan server start

# Start a specific version
agentspan server start --version 0.1.0

# Start on a custom port with a default model
agentspan server start --port 9090 --model openai/gpt-4o

# Stop the server
agentspan server stop

# View server logs
agentspan server logs

# Follow server logs in real-time
agentspan server logs -f
```

The server JAR is downloaded from GitHub releases and cached in `~/.agentspan/server/`. On each `server start`, the CLI checks GitHub for updates and re-downloads if a newer version is available.

### Agent Operations

```bash
# Create a new agent config file
agentspan agent init mybot
agentspan agent init mybot --model anthropic/claude-sonnet-4-20250514 --format json

# Run an agent
agentspan agent run --name mybot "Hello, what can you do?"
agentspan agent run --config mybot.yaml "Hello, what can you do?"
agentspan agent run --name mybot --no-stream "Fire and forget"

# List all registered agents
agentspan agent list

# Get agent definition as JSON
agentspan agent get mybot
agentspan agent get mybot --version 2

# Delete an agent
agentspan agent delete mybot
agentspan agent delete mybot --version 1

# Check execution status
agentspan agent status <execution-id>

# Search execution history
agentspan agent execution
agentspan agent execution --name mybot
agentspan agent execution --status COMPLETED --since 1h
agentspan agent execution --since 7d
agentspan agent execution --window now-30m

# Stream events from a running agent
agentspan agent stream <execution-id>

# Respond to human-in-the-loop tasks
agentspan agent respond <execution-id> --approve
agentspan agent respond <execution-id> --deny --reason "Amount too high"

# Compile agent config to workflow definition (inspect only)
agentspan agent compile mybot.yaml
```

### Time Filters

The `--since` and `--window` flags accept human-readable time specs:

| Format | Meaning |
|--------|---------|
| `30s` | 30 seconds |
| `5m` | 5 minutes |
| `1h` | 1 hour |
| `1d` | 1 day |
| `7d` | 7 days |
| `1mo` | 1 month (30 days) |
| `1y` | 1 year (365 days) |

### CLI Self-Update

```bash
agentspan update
```

### Configuration

```bash
# Set server URL and auth credentials
agentspan configure --url http://myserver:8080
agentspan configure --auth-key KEY --auth-secret SECRET

# Override server URL for a single command
agentspan --server http://other:8080 agent list
```

Configuration is stored in `~/.agentspan/config.json`. Environment variables take precedence:

| Variable | Description |
|----------|-------------|
| `AGENT_SERVER_URL` | Server URL (default: `http://localhost:8080`) |
| `CONDUCTOR_AUTH_KEY` | Auth key |
| `CONDUCTOR_AUTH_SECRET` | Auth secret |

### Version

```bash
agentspan version
```

## Agent Config Format

YAML or JSON. See [examples/](examples/) for samples.

```yaml
name: my-agent
description: A helpful assistant
model: openai/gpt-4o
instructions: You are a helpful assistant.
maxTurns: 25
tools:
  - name: web_search
    type: worker
```

## Distribution

The CLI is distributed through three channels:

1. **npm** (`@agentspan/agentspan`) -- Node.js wrapper downloads the Go binary on install
2. **Homebrew** (`agentspan/agentspan` tap) -- Pre-built binaries for macOS and Linux
3. **Shell installer** -- Direct binary download to `/usr/local/bin`
4. **GitHub Releases** -- Pre-built binaries for all platforms

### Supported Platforms

| OS | Architecture |
|----|-------------|
| macOS | x86_64, ARM64 (Apple Silicon) |
| Linux | x86_64, ARM64 |
| Windows | x86_64, ARM64 |

## Development

### Building

```bash
cd cli
go build -o agentspan .
```

### Cross-platform build

```bash
cd cli
VERSION=0.1.0 ./build.sh
```

Produces binaries in `cli/dist/` for all 6 platform/arch combinations.

### Release

Push a tag matching `cli-v*` to trigger the release workflow:

```bash
git tag cli-v0.1.0
git push origin cli-v0.1.0
```

This builds all binaries, creates a GitHub release, publishes to npm, and updates the Homebrew tap.

## License

Apache 2.0
