# OpenAgent CLI

Go CLI for the OpenAgent runtime — start the server, create agents, run them, and stream results.

## Install

```bash
cd cli
go build -o openagent .
# optionally move to PATH
mv openagent /usr/local/bin/
```

## Quick Start

```bash
# 1. Start the runtime server
openagent server start --model openai/gpt-4o

# 2. Create an agent config
openagent agent init my-assistant --model openai/gpt-4o

# 3. Run the agent with a prompt
openagent agent run my-assistant.yaml "What is the capital of France?"
```

## Commands

### Server Management

```bash
openagent server start              # Build & start the runtime
openagent server start -p 9090      # Custom port
openagent server start -m openai/gpt-4o  # Set default model
openagent server build              # Build the JAR only
openagent server status             # Check if server is running
```

### Agent Operations

```bash
openagent agent init <name>                    # Create agent config file
openagent agent init <name> -f json            # JSON format
openagent agent run <config> <prompt>          # Start + stream
openagent agent run <config> <prompt> --no-stream  # Start only
openagent agent compile <config>               # Compile to workflow def
openagent agent status <workflow-id>           # Check execution status
openagent agent stream <workflow-id>           # Stream events
openagent agent respond <workflow-id> --approve    # HITL approve
openagent agent respond <workflow-id> --deny -m "reason"  # HITL deny
```

### Configuration

```bash
openagent configure --url http://localhost:8080
openagent configure --auth-key KEY --auth-secret SECRET
```

Config is stored in `~/.openagent/config.json`. Environment variables take precedence:

- `AGENT_SERVER_URL` — runtime URL
- `CONDUCTOR_AUTH_KEY` — auth key
- `CONDUCTOR_AUTH_SECRET` — auth secret

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
