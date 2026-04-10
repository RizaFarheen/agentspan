# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Coding Agent REPL — a filesystem-aware coding assistant backed by the Conductor server.

This example is a Claude Code-style assistant you can actually use in a working session.
It runs as a durable Conductor workflow, giving you things a local agent cannot:

  - Sessions survive disconnects — reconnect with --resume and pick up where you left off
  - Every tool call, LLM decision, and token is logged on the server automatically
  - /signal injects context mid-task without restarting the agent
  - Ctrl+C stops gracefully (current task finishes, output preserved)
  - View the full execution graph live at http://localhost:8080

Usage:
    python 82_coding_agent.py                      # new session in current dir
    python 82_coding_agent.py --cwd /path/to/repo  # new session in a specific dir
    python 82_coding_agent.py --resume             # resume last session

Requirements:
    - Conductor server (conductor.workflow-message-queue.enabled=true)
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - AGENTSPAN_LLM_MODEL=anthropic/claude-sonnet-4-20250514
"""

import argparse
import os
import signal
import subprocess
from pathlib import Path

os.environ.setdefault("AGENTSPAN_LOG_LEVEL", "WARNING")

from agentspan.agents import Agent, AgentRuntime, EventType, tool, wait_for_message_tool
from settings import settings

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SESSION_FILE = Path("/tmp/agentspan_coding_agent.session")
_DEFAULT_SHELL_TIMEOUT = 30   # seconds per shell command
_MAX_FILE_BYTES = 200_000     # 200 KB — refuse larger files in read_file
_MAX_SHELL_OUTPUT = 8_000     # truncate shell output shown to the LLM
_MAX_SHELL_DISPLAY = 2_000    # truncate shell output shown in the terminal


# ---------------------------------------------------------------------------
# Agent builder
# ---------------------------------------------------------------------------

def build_agent(working_dir: str, shell_timeout: int = _DEFAULT_SHELL_TIMEOUT) -> Agent:
    """Build the coding agent. All tools close over working_dir and shell_timeout."""

    receive_message = wait_for_message_tool(
        name="wait_for_message",
        description="Wait for the next user message. Payload has a 'text' field.",
    )

    @tool
    def read_file(path: str) -> str:
        """Read a file and return its text contents. Paths may be absolute or relative to the working directory."""
        target = Path(path) if os.path.isabs(path) else Path(working_dir) / path
        if not target.exists():
            return f"Error: {path!r} does not exist."
        if target.is_dir():
            return f"Error: {path!r} is a directory. Use list_dir to browse it."
        size = target.stat().st_size
        if size > _MAX_FILE_BYTES:
            return (
                f"Error: {path!r} is {size:,} bytes (limit {_MAX_FILE_BYTES:,}). "
                "Use search_in_files to find specific content instead."
            )
        try:
            return target.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            return f"Error reading {path!r}: {exc}"

    @tool
    def write_file(path: str, content: str) -> str:
        """Write content to a file, creating parent directories as needed. Overwrites existing files."""
        target = Path(path) if os.path.isabs(path) else Path(working_dir) / path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            return f"Wrote {len(content):,} bytes to {str(target)!r}."
        except Exception as exc:
            return f"Error writing {path!r}: {exc}"

    @tool
    def list_dir(path: str = ".") -> str:
        """List directory contents with file sizes. Paths may be absolute or relative to the working directory."""
        target = Path(path) if os.path.isabs(path) else Path(working_dir) / path
        if not target.exists():
            return f"Error: {path!r} does not exist."
        if not target.is_dir():
            return f"Error: {path!r} is not a directory."
        try:
            entries = sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name))
            lines = []
            for entry in entries:
                if entry.is_dir():
                    lines.append(f"  {entry.name}/")
                else:
                    lines.append(f"  {entry.name}  ({entry.stat().st_size:,} bytes)")
            header = str(target) + "/"
            return header + "\n" + "\n".join(lines) if lines else header + " (empty)"
        except Exception as exc:
            return f"Error listing {path!r}: {exc}"

    @tool
    def find_files(pattern: str, path: str = ".") -> str:
        """Find files matching a glob pattern (e.g. '**/*.py'). Path relative to working directory."""
        base = Path(path) if os.path.isabs(path) else Path(working_dir) / path
        if not base.exists():
            return f"Error: {path!r} does not exist."
        if not base.is_dir():
            return f"Error: {path!r} is not a directory."
        try:
            matches = sorted(m for m in base.glob(pattern) if m.is_file())
            if not matches:
                return f"No files matching {pattern!r} under {str(base)!r}."
            lines = []
            for m in matches[:200]:
                try:
                    rel = m.relative_to(working_dir)
                except ValueError:
                    rel = m
                lines.append(str(rel))
            suffix = f"\n... ({len(matches) - 200} more)" if len(matches) > 200 else ""
            return "\n".join(lines) + suffix
        except Exception as exc:
            return f"Error finding files: {exc}"

    @tool
    def search_in_files(regex: str, path: str = ".", file_glob: str = "**/*") -> str:
        """Search for a regex pattern in file contents. Returns file:line: matching_line entries."""
        import re as _re
        base = Path(path) if os.path.isabs(path) else Path(working_dir) / path
        try:
            compiled = _re.compile(regex)
        except _re.error as exc:
            return f"Invalid regex {regex!r}: {exc}"
        results = []
        for filepath in sorted(base.glob(file_glob)):
            if not filepath.is_file() or filepath.stat().st_size > _MAX_FILE_BYTES:
                continue
            try:
                for lineno, line in enumerate(
                    filepath.read_text(encoding="utf-8", errors="replace").splitlines(), 1
                ):
                    if compiled.search(line):
                        try:
                            label = str(filepath.relative_to(working_dir))
                        except ValueError:
                            label = str(filepath)
                        results.append(f"{label}:{lineno}: {line.rstrip()}")
                        if len(results) >= 100:
                            break
            except Exception:
                continue
            if len(results) >= 100:
                break
        if not results:
            return f"No matches for {regex!r} in {str(base)!r} ({file_glob})."
        suffix = "\n... (truncated at 100 matches)" if len(results) >= 100 else ""
        return "\n".join(results) + suffix

    @tool
    def run_shell(command: str) -> str:
        """Run a shell command in the working directory. Returns stdout + stderr with exit code."""
        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=working_dir,
                capture_output=True,
                text=True,
                timeout=shell_timeout,
            )
            combined = (proc.stdout + proc.stderr).strip()
            if len(combined) > _MAX_SHELL_OUTPUT:
                combined = combined[:_MAX_SHELL_OUTPUT] + f"\n... (truncated, {len(combined):,} chars total)"
            return f"[exit {proc.returncode}]\n{combined}" if combined else f"[exit {proc.returncode}] (no output)"
        except subprocess.TimeoutExpired:
            return f"Error: command timed out after {shell_timeout}s."
        except Exception as exc:
            return f"Error: {exc}"

    @tool
    def reply_to_user(message: str) -> str:
        """Send your response to the user. Call this when the task is complete."""
        return "ok"

    return Agent(
        name="coding_agent",
        model=settings.llm_model,
        tools=[
            receive_message,
            read_file,
            write_file,
            list_dir,
            run_shell,
            find_files,
            search_in_files,
            reply_to_user,
        ],
        max_turns=100_000,
        stateful=True,
        instructions=f"""You are a coding assistant with direct filesystem and shell access.
Working directory: {working_dir}

Available tools:
- read_file(path)                              read any text file
- write_file(path, content)                    create or overwrite a file
- list_dir(path=".")                           list directory contents
- run_shell(command)                           run a shell command (cwd: {working_dir}, timeout: {shell_timeout}s)
- find_files(pattern, path=".")               find files by glob, e.g. "**/*.py"
- search_in_files(regex, path=".", file_glob) grep files by regex
- reply_to_user(message)                       send your response to the user

Rules:
- Work autonomously. Do not ask for permission before reading files, running commands, or writing.
- Make as many tool calls as needed to fully complete the task before replying.
- Keep replies concise: what was done, what changed, key output. No lengthy explanations.
- If the task is ambiguous, make a reasonable assumption and proceed.
- If you see [SIGNALS] ... [/SIGNALS] in a message, those are runtime instructions — follow them.

Repeat indefinitely:
1. Call wait_for_message to receive the next task.
2. Think through the task. Explore, read, search, modify, and run as needed.
3. Complete the task fully.
4. Call reply_to_user with a concise summary.
5. Return to step 1 immediately.
""",
    )
