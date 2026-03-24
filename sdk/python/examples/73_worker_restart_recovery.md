# Worker Restart Recovery Demo

This demo proves that a workflow survives a worker-service crash and continues after the worker comes back.

## Prerequisites

Start the Agentspan server with Docker Compose from the deployment branch or worktree:

```bash
cd deployment/docker-compose
cp .env.example .env
# set OPENAI_API_KEY in .env
docker compose up -d
```

Create a clean virtual environment and install the published package:

```bash
cd sdk/python/examples
python3 -m venv .venv-pypi
source .venv-pypi/bin/activate
pip install --upgrade pip
pip install agentspan
```

Set the server URL and model:

```bash
export AGENTSPAN_SERVER_URL=http://localhost:8080/api
export AGENTSPAN_LLM_MODEL=openai/gpt-4o-mini
```

## Terminal 1: Deploy the agent definition

```bash
python 73_worker_restart_recovery.py deploy
```

## Terminal 2: Start the worker service

```bash
python 73_worker_restart_recovery.py serve
```

This writes the worker PID and process group to `/tmp/agentspan_worker_restart.worker.json`.

## Terminal 3: Start the workflow

```bash
python 73_worker_restart_recovery.py start
```

Wait for:

```text
Attempt 1 is now running.
Hard-kill the worker service from another terminal with:
  python 73_worker_restart_recovery.py kill-worker
Then restart the worker service with:
  python 73_worker_restart_recovery.py serve
```

## Terminal 4: Hard-kill the worker service

```bash
python 73_worker_restart_recovery.py kill-worker
```

This sends `SIGKILL` to the worker process group, including the polling child processes.

## Terminal 5: Restart the worker service

```bash
python 73_worker_restart_recovery.py serve
```

## Optional: Watch status separately

```bash
python 73_worker_restart_recovery.py status
```

The attempt history file at `/tmp/agentspan_worker_restart.attempts.json` should eventually show:

- attempt 1 started but never completed
- attempt 2 completed after the worker service came back

## What this proves

- Agent definitions can be deployed separately from worker processes
- The workflow remains durable while the worker service is down
- After the worker returns, the tool task is retried and the same workflow finishes
- Recovery is from durable workflow state, not from keeping the original Python process alive
