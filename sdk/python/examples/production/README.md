# Production Deployment

## How it works

An agentspan application is a single Python file that defines agents and serves workers.

```python
# my_app.py
from agentspan.agents import Agent, AgentRuntime

agent = Agent(name="my_agent", model="openai/gpt-4o", instructions="...", tools=[...])

if __name__ == "__main__":
    with AgentRuntime() as rt:
        rt.deploy(agent)    # Push definition to server (idempotent)
        rt.serve(agent)     # Start workers, poll for tasks (blocks)
```

That's it. One file. Two lines in `main`.

## The three concerns

| Concern | How | Who |
|---|---|---|
| **Deploy** | `agentspan deploy my_app` (CI/CD) or `rt.deploy()` at startup | CI/CD pipeline or app startup |
| **Serve** | `python my_app.py` or `agentspan serve my_app` | Docker / K8s / systemd |
| **Run** | `agentspan run my_agent "prompt"` or API call | External trigger (webhook, cron, UI) |

Deploy is idempotent — calling it on every startup is safe and ensures the server always has the latest definition.

## Running locally

```bash
# Terminal 1: Start the app (deploys + serves)
python my_app.py

# Terminal 2: Trigger the agent
agentspan run my_agent "Do the thing"
```

## CI/CD deployment

```yaml
# GitHub Actions / Jenkins / etc.
steps:
  - run: agentspan deploy my_app
```

The `deploy` command imports the module, discovers all Agent objects, and pushes their definitions to the server. No workers are started.

## Production runtime

```dockerfile
# Dockerfile
CMD ["python", "my_app.py"]
```

Or with the CLI:

```dockerfile
CMD ["agentspan", "serve", "my_app"]
```

## Triggering agents

Agents are triggered by name, not by object reference. This decouples the trigger from the definition.

```bash
# CLI
agentspan run my_agent "What is the weather?"

# Python (from any process)
from agentspan.agents import AgentRuntime
with AgentRuntime() as rt:
    result = rt.run("my_agent", "What is the weather?")

# REST API
curl -X POST http://localhost:8080/api/agent/start \
  -H "Content-Type: application/json" \
  -d '{"name": "my_agent", "prompt": "What is the weather?"}'
```
