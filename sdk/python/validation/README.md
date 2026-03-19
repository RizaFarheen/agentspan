# Validation: Multi-Run Example Runner

Run SDK examples against multiple models, compare outputs with an LLM judge.

---

## 30-Second Quick Start

```bash
# 1. Install
cd sdk/python && uv sync --extra validation

# 2. Copy config
cp validation/runs.toml.example validation/runs.toml

# 3. Run smoke test (7 examples, ~2 min)
uv run python3 -m validation.scripts.run_examples \
  --config validation/runs.toml \
  --run openai-smoke-test
```

That's it. Results in `validation/output/run_*/`.

---

## Prerequisites

- Python 3.11+
- Agentspan server running at `http://localhost:8080`
- `OPENAI_API_KEY` set (required for OpenAI/LangGraph/LangChain examples and judge)
- `ANTHROPIC_API_KEY` for Anthropic runs
- `GOOGLE_API_KEY` for ADK runs

---

## Common Recipes

### Smoke tests — fastest sanity check

```bash
# OpenAI (7 examples)
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml --run openai-smoke-test

# Anthropic Claude
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml --run anthropic-smoke-test

# Claude Sonnet 4.6
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml --run claude-sonnet-4-6-smoke-test

# All three + judge comparison
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run openai-smoke-test,anthropic-smoke-test,claude-sonnet-4-6-smoke-test --judge
```

### Full OpenAI example suite (10 examples)

```bash
# Single model
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml --run openai

# Model comparison with judge
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run openai,anthropic,claude-sonnet-4-6,gpt-5-4 --judge
```

### LangGraph / LangChain

```bash
# Quick smoke test (6 examples) — agentspan + native, judged
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run lc-smoke-test,lc-smoke-test-native --judge

# Full LangGraph (40 examples)
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run langgraph,langgraph-native --judge

# Full LangChain (25 examples)
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run langchain,langchain-native --judge
```

### ADK (Google Gemini)

```bash
# Hello world debug
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run adk-hello-native,adk-hello-agentspan --judge

# Full ADK suite (32 examples)
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run adk,adk-agentspan --judge
```

### Preview without running

```bash
uv run python3 -m validation.scripts.run_examples --config validation/runs.toml \
  --run openai-smoke-test --dry-run
```

### Judge existing results

```bash
uv run python3 -m validation.scripts.judge_results --run-dir validation/output/run_20250101_120000_abc123/
```

---

## All Run Names

| Run | Group | Model | Mode |
|-----|-------|-------|------|
| `openai` | OPENAI_EXAMPLES (10) | gpt-4o | Agentspan |
| `agentspan` | OPENAI_EXAMPLES (10) | gpt-4o | Agentspan |
| `anthropic` | OPENAI_EXAMPLES (10) | claude-sonnet-4-20250514 | Agentspan |
| `claude-sonnet-4-6` | OPENAI_EXAMPLES (10) | claude-sonnet-4-6 | Agentspan |
| `gpt-5-4` | OPENAI_EXAMPLES (10) | gpt-5.4 | Agentspan |
| `openai-smoke-test` | SMOKE_TEST (7) | gpt-4o | Agentspan |
| `anthropic-smoke-test` | SMOKE_TEST (7) | claude-sonnet-4-20250514 | Agentspan |
| `claude-sonnet-4-6-smoke-test` | SMOKE_TEST (7) | claude-sonnet-4-6 | Agentspan |
| `adk-hello-native` | ADK_HELLO (1) | gemini-2.5-flash | Native |
| `adk-hello-agentspan` | ADK_HELLO (1) | gemini-2.5-flash | Agentspan |
| `adk` | ADK_EXAMPLES (32) | gemini-2.5-flash | Native |
| `adk-agentspan` | ADK_EXAMPLES (32) | gemini-2.5-flash | Agentspan |
| `langgraph` | LANGGRAPH_EXAMPLES (40) | gpt-4o-mini | Agentspan |
| `langgraph-native` | LANGGRAPH_EXAMPLES (40) | gpt-4o-mini | Native |
| `langchain` | LANGCHAIN_EXAMPLES (25) | gpt-4o-mini | Agentspan |
| `langchain-native` | LANGCHAIN_EXAMPLES (25) | gpt-4o-mini | Native |
| `lc-smoke-test` | LC_SMOKE_TEST (6) | gpt-4o-mini | Agentspan |
| `lc-smoke-test-native` | LC_SMOKE_TEST (6) | gpt-4o-mini | Native |
| `lc-claude-sonnet-4-6` | LC_SMOKE_TEST (6) | claude-sonnet-4-6 | Agentspan |
| `lc-claude-sonnet-4-6-native` | LC_SMOKE_TEST (6) | claude-sonnet-4-6 | Native |

**Agentspan** = runs through Conductor orchestration. **Native** = runs directly via SDK, bypasses Conductor. Pair them with `--judge` to compare.

---

## Example Groups

| Group | Count | Contents |
|-------|-------|----------|
| `SMOKE_TEST` | 7 | Basic + structured output + handoffs (OpenAI + ADK) |
| `OPENAI_EXAMPLES` | 10 | Full OpenAI Agents SDK suite |
| `ADK_HELLO` | 1 | Single hello-world for ADK debugging |
| `ADK_EXAMPLES` | 32 | Full Google ADK suite |
| `LC_SMOKE_TEST` | 6 | 3 LangGraph + 3 LangChain basics |
| `LANGGRAPH_EXAMPLES` | 40 | Full LangGraph suite |
| `LANGCHAIN_EXAMPLES` | 25 | Full LangChain suite |
| `PASSING_EXAMPLES` | 37 | Stable ADK-style examples |
| `SLOW_EXAMPLES` | 4 | >2 min each (08, 13, 23, 31) |
| `HITL_EXAMPLES` | 4 | Require stdin input (02, 09, 09b, 09c) |
| `KNOWN_FAILURES` | 6 | Server/config issues — skip these |

---

## Output

Each run creates `validation/output/run_{timestamp}_{id}/`:

```
run_20250101_120000_abc123/
├── openai/
│   ├── results.csv
│   └── outputs/
├── anthropic/
│   └── ...
└── judge/
    ├── report.html   ← open this — interactive heatmap + side-by-side diffs
    ├── report.md
    └── results.csv
```

Open `judge/report.html` in a browser for the full interactive dashboard.

---

## TOML Config Reference

`validation/runs.toml` (gitignored). Copy from `validation/runs.toml.example`.

```toml
[defaults]
timeout = 300       # per-example timeout (seconds)
parallel = true
max_workers = 8
server_url = "http://localhost:8080/api"

[judge]
baseline_run = "openai"   # run used as comparison baseline
model = "gpt-4o-mini"

[runs.my-run]
group = "SMOKE_TEST"
model = "openai/gpt-4o"
# native = true           # bypass Conductor, run via SDK directly
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | — | OpenAI/LangGraph/LangChain examples + judge |
| `ANTHROPIC_API_KEY` | — | Anthropic model examples |
| `GOOGLE_API_KEY` | — | ADK/Gemini examples |
| `AGENTSPAN_SERVER_URL` | `http://localhost:8080/api` | Conductor server |
| `AGENTSPAN_AUTH_KEY` | — | Auth (if required) |
| `AGENTSPAN_AUTH_SECRET` | — | Auth secret (if required) |
| `JUDGE_LLM_MODEL` | `gpt-4o-mini` | Override judge model |
| `JUDGE_MAX_OUTPUT_CHARS` | `3000` | Truncate outputs before judging |
| `JUDGE_MAX_TOKENS` | `300` | Max tokens per judge response |
| `JUDGE_MAX_CALLS` | `0` (unlimited) | Budget cap on judge API calls |
| `JUDGE_RATE_LIMIT` | `0.5` | Seconds between judge calls |

---

## CLI Reference

```
run_examples.py  --config PATH
                 [--run NAMES]          comma-separated run names
                 [--judge]              run cross-run judge after execution
                 [--dry-run]            preview without executing
                 [--output-dir DIR]     default: validation/output/
                 [--resume [RUN_DIR]]   skip already-completed examples
                 [--retry-failed DIR]   re-run only failed examples
                 [--list-groups]        list available groups and exit

judge_results.py --run-dir PATH         multi-run parent directory
                 [--judge-model MODEL]  override judge model
```
