# Claude Code Agent Examples

7 examples demonstrating Claude Agent SDK integration with Agentspan, from a simple hello-world to fully-routed Tier 3 pipelines.

## Quick Start

```bash
export AGENTSPAN_SERVER_URL=http://localhost:8080/api
# Install and authenticate the Claude CLI
claude --version

cd sdk/python
uv run python examples/claude/01_hello_world.py
```

## Integration Tiers

| Tier | Flag | What changes |
|------|------|-------------|
| **Tier 1** (default) | — | Full session durability + SSE event observability |
| **Tier 2** | `conductor_subagents=True` | Claude's `Agent` tool spawns real Conductor SUB_WORKFLOWs |
| **Tier 3** | `agentspan_routing=True` | All tool calls routed through Conductor SIMPLE tasks via `AgentspanTransport`; implies Tier 2 |

## Examples

| # | File | Tier | Topic |
|---|------|------|-------|
| 01 | `01_hello_world.py` | 1 | Minimal read-only agent |
| 02 | `02_codebase_analyzer.py` | 1 | Analyze any project directory |
| 03 | `03_code_editor.py` | 1 | Read + write + run tests |
| 04 | `04_session_resume.py` | 1 | Durable sessions across runs |
| 05 | `05_conductor_subagents.py` | 2 | Subagents as real Conductor SUB_WORKFLOWs |
| 06 | `06_agentspan_routing.py` | 3 | All tools routed through Conductor |
| 07 | `07_mixed_agent_pipeline.py` | 1 | Claude Code agent as a tool in a multi-agent pipeline |

## Requirements

All examples require:
- `AGENTSPAN_SERVER_URL=http://localhost:8080/api`
- Claude CLI installed: `npm install -g @anthropic-ai/claude-code`
- Authenticated: `claude login`
- `claude-agent-sdk` Python package: `uv add claude-agent-sdk`

Tier 3 (`06_agentspan_routing.py`) additionally requires:
- `ANTHROPIC_API_KEY` — Transport calls the Anthropic Messages API directly
- `claude_builtin_*` workers registered in Conductor:
  ```bash
  uv run python -m agentspan.agents.frameworks.claude_builtin_workers
  ```

Example `07_mixed_agent_pipeline.py` additionally requires:
- `OPENAI_API_KEY` for the orchestrator LangGraph agent
