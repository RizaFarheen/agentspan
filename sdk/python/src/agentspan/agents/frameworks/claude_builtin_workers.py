# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Built-in tool workers for Claude Agent SDK Tier 3 routing."""

import os
import pathlib
import re
import subprocess

try:
    import anthropic as _anthropic
except ImportError:
    _anthropic = None  # type: ignore[assignment]

from agentspan.agents import tool


def _safe_path(cwd: str, file_path: str) -> pathlib.Path:
    """Resolve file_path within cwd, raising ValueError on traversal attempts."""
    base = pathlib.Path(cwd).resolve()
    resolved = (base / file_path).resolve()
    if not str(resolved).startswith(str(base) + os.sep) and resolved != base:
        raise ValueError(f"Path '{file_path}' escapes working directory")
    return resolved


@tool
def claude_builtin_bash(command: str, timeout: int = 30, cwd: str = ".") -> dict:
    """
    SECURITY: Runs with shell=True. Deploy only in controlled environments
    with pre-vetted agent prompts. Consider Docker sandboxing for production.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[stderr]: {result.stderr}"
        return {"output": output, "exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        return {"output": f"Command timed out after {timeout}s", "exit_code": 124}


@tool
def claude_builtin_read(file_path: str, offset: int = 0, limit: int = None, cwd: str = ".") -> dict:
    """Read a file, optionally with line offset and limit."""
    try:
        path = _safe_path(cwd, file_path)
        lines = path.read_text().splitlines(keepends=True)
        if offset:
            lines = lines[offset:]
        if limit:
            lines = lines[:limit]
        return {"output": "".join(lines), "total_lines": len(lines)}
    except ValueError as e:
        return {"output": str(e), "exit_code": 1}
    except FileNotFoundError:
        return {"output": f"File not found: {file_path}", "exit_code": 1}


@tool
def claude_builtin_write(file_path: str, content: str, cwd: str = ".") -> dict:
    """Write content to a file, creating parent directories as needed."""
    try:
        path = _safe_path(cwd, file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return {"output": f"Wrote {len(content)} bytes to {file_path}"}
    except ValueError as e:
        return {"output": str(e), "exit_code": 1}


@tool
def claude_builtin_edit(
    file_path: str,
    old_string: str,
    new_string: str,
    replace_all: bool = False,
    cwd: str = ".",
) -> dict:
    """Edit a file by replacing old_string with new_string."""
    try:
        path = _safe_path(cwd, file_path)
        content = path.read_text()
        count = content.count(old_string)
        if count == 0:
            return {"output": f"Error: string not found in {file_path}", "exit_code": 1}
        if count > 1 and not replace_all:
            return {
                "output": f"Error: string appears {count} times; use replace_all=True",
                "exit_code": 1,
            }
        if replace_all:
            path.write_text(content.replace(old_string, new_string))
        else:
            path.write_text(content.replace(old_string, new_string, 1))
        return {"output": f"Replaced {count if replace_all else 1} occurrence(s)"}
    except ValueError as e:
        return {"output": str(e), "exit_code": 1}


@tool
def claude_builtin_glob(pattern: str, path: str = ".", cwd: str = ".") -> dict:
    """Find files matching a glob pattern within a directory."""
    try:
        base = _safe_path(cwd, path)
        matches = [str(p) for p in base.glob(pattern)]
        return {"output": "\n".join(sorted(matches)), "count": len(matches)}
    except ValueError as e:
        return {"output": str(e), "exit_code": 1}


@tool
def claude_builtin_grep(
    pattern: str, path: str = ".", glob_pattern: str = None, cwd: str = "."
) -> dict:
    """Search files for a regex pattern."""
    try:
        base = _safe_path(cwd, path)
        file_glob = glob_pattern or "**/*"
        results = []
        for f in base.glob(file_glob):
            if not f.is_file():
                continue
            try:
                for i, line in enumerate(f.read_text().splitlines(), 1):
                    if re.search(pattern, line):
                        results.append(f"{f}:{i}: {line}")
            except (UnicodeDecodeError, PermissionError):
                pass
        return {"output": "\n".join(results), "count": len(results)}
    except ValueError as e:
        return {"output": str(e), "exit_code": 1}


@tool
def claude_builtin_websearch(query: str) -> dict:
    """Search the web using Claude's server-side web search tool."""
    if _anthropic is None:
        return {"output": "anthropic package not installed", "exit_code": 1}
    client = _anthropic.Anthropic()
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": query}],
        tools=[{"type": "web_search_20260209", "name": "web_search"}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    return {"output": text}


@tool
def claude_builtin_webfetch(url: str, prompt: str = None) -> dict:
    """Fetch and summarize a web page using Claude's server-side web fetch tool."""
    if _anthropic is None:
        return {"output": "anthropic package not installed", "exit_code": 1}
    client = _anthropic.Anthropic()
    content = f"Fetch {url}"
    if prompt:
        content += f" and {prompt}"
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": content}],
        tools=[{"type": "web_fetch_20260209", "name": "web_fetch"}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    return {"output": text}
