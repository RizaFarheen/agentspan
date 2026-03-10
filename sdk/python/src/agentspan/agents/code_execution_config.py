# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""First-class code execution configuration for agents.

Provides :class:`CodeExecutionConfig` for declarative code execution on
:class:`Agent`, :class:`CommandValidator` for command whitelisting, and
a factory function that auto-creates an ``execute_code`` tool.

Example::

    from agentspan.agents import Agent, CodeExecutionConfig

    # Simple — just flip the flag
    agent = Agent(
        name="coder",
        model="openai/gpt-4o",
        local_code_execution=True,
    )

    # With restrictions
    agent = Agent(
        name="safe_coder",
        model="openai/gpt-4o",
        local_code_execution=True,
        allowed_languages=["python", "bash"],
        allowed_commands=["pip", "ls", "cat"],
    )

    # Full control
    from agentspan.agents.code_executor import DockerCodeExecutor

    agent = Agent(
        name="sandboxed",
        model="openai/gpt-4o",
        code_execution=CodeExecutionConfig(
            allowed_languages=["python"],
            allowed_commands=["pip"],
            executor=DockerCodeExecutor(image="python:3.12-slim"),
        ),
    )
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, List, Optional

if TYPE_CHECKING:
    from agentspan.agents.code_executor import CodeExecutor


@dataclass
class CodeExecutionConfig:
    """Configuration for first-class code execution on an Agent.

    When attached to an :class:`Agent` (directly or via the
    ``local_code_execution`` shorthand flag), the agent automatically
    gains an ``execute_code`` tool that the LLM can invoke.

    Attributes:
        enabled: Whether code execution is active (default ``True``).
        allowed_languages: Interpreter languages the LLM may use
            (default ``["python"]``).  Supported values match
            :class:`LocalCodeExecutor` interpreters: ``python``,
            ``bash``, ``sh``, ``node``, ``javascript``, ``ruby``.
        allowed_commands: Shell commands the code may invoke (e.g.
            ``["pip", "ls", "curl"]``).  Empty list means **no
            restrictions**.  This is a best-effort heuristic — for
            untrusted code, use :class:`DockerCodeExecutor`.
        executor: The :class:`CodeExecutor` to use.  ``None`` means
            a :class:`LocalCodeExecutor` is created automatically.
        timeout: Maximum execution time in seconds (default ``30``).
        working_dir: Working directory for execution.
    """

    enabled: bool = True
    allowed_languages: List[str] = field(default_factory=lambda: ["python"])
    allowed_commands: List[str] = field(default_factory=list)
    executor: Optional[Any] = None  # CodeExecutor; Any to avoid import cycle
    timeout: int = 30
    working_dir: Optional[str] = None


# ── Command Validator ──────────────────────────────────────────────────


class CommandValidator:
    """Best-effort validator that checks code against an allowed-command list.

    Scans code for shell command invocations and rejects any that are not
    in the whitelist.

    .. warning::

        This is a **convenience safety layer**, not a security boundary.
        Determined code can bypass regex-based detection (e.g. via
        ``eval``, encoded strings, or dynamic imports).  For untrusted
        code, use :class:`DockerCodeExecutor` with ``network_enabled=False``.
    """

    # Python patterns that invoke external commands
    _PYTHON_PATTERNS = [
        # subprocess.run(["cmd", ...]) / subprocess.call(["cmd", ...]) etc.
        re.compile(r"subprocess\.\w+\(\s*\[?\s*[\"'](\S+?)[\"']"),
        # os.system("cmd ...") / os.popen("cmd ...")
        re.compile(r"os\.(?:system|popen)\(\s*[\"'](\S+)"),
        # Jupyter ! syntax
        re.compile(r"^\s*!(\S+)", re.MULTILINE),
    ]

    # Bash/shell patterns
    _BASH_COMMAND_RE = re.compile(
        r"(?:^|[|;&]\s*|`|\$\(\s*)(\w[\w.+-]*)", re.MULTILINE
    )
    _BASH_BUILTINS = frozenset({
        "if", "then", "else", "elif", "fi", "for", "while", "do", "done",
        "case", "esac", "in", "function", "select", "until", "echo", "printf",
        "read", "local", "export", "unset", "set", "shift", "return", "exit",
        "true", "false", "test", "[", "[[", "declare", "typeset", "readonly",
        "source", ".", "eval", "exec", "trap", "wait", "break", "continue",
    })

    def __init__(self, allowed_commands: List[str]) -> None:
        self.allowed_commands = frozenset(allowed_commands)

    def validate(self, code: str, language: str) -> Optional[str]:
        """Validate *code* against the allowed-command list.

        Returns ``None`` if the code passes validation, or an error
        message string describing the violation.
        """
        if not self.allowed_commands:
            return None  # no restrictions

        if language in ("python", "python3"):
            return self._validate_python(code)
        elif language in ("bash", "sh"):
            return self._validate_bash(code)
        else:
            # For other languages, skip command validation
            return None

    def _validate_python(self, code: str) -> Optional[str]:
        for pattern in self._PYTHON_PATTERNS:
            for match in pattern.finditer(code):
                cmd = match.group(1).split("/")[-1]  # handle /usr/bin/cmd
                if cmd not in self.allowed_commands:
                    return (
                        f"Command '{cmd}' is not allowed. "
                        f"Allowed commands: {', '.join(sorted(self.allowed_commands))}"
                    )
        return None

    def _validate_bash(self, code: str) -> Optional[str]:
        # Strip comments
        lines = []
        for line in code.splitlines():
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            # Remove inline comments (naive — doesn't handle quoted #)
            comment_idx = line.find(" #")
            if comment_idx >= 0:
                line = line[:comment_idx]
            lines.append(line)
        cleaned = "\n".join(lines)

        for match in self._BASH_COMMAND_RE.finditer(cleaned):
            cmd = match.group(1)
            if cmd in self._BASH_BUILTINS:
                continue
            if cmd not in self.allowed_commands:
                return (
                    f"Command '{cmd}' is not allowed. "
                    f"Allowed commands: {', '.join(sorted(self.allowed_commands))}"
                )
        return None


# ── Tool factory ───────────────────────────────────────────────────────


def _make_code_execution_tool(
    executor: Any,
    allowed_languages: List[str],
    allowed_commands: List[str],
    timeout: int,
) -> Any:
    """Create a ``@tool``-decorated function for code execution.

    The returned function can be appended to ``Agent.tools`` directly.
    """
    from agentspan.agents.code_executor import LocalCodeExecutor
    from agentspan.agents.tool import tool

    validator = CommandValidator(allowed_commands) if allowed_commands else None
    langs_str = ", ".join(allowed_languages)

    @tool(name="execute_code")
    def execute_code(code: str, language: str = "python") -> str:
        """Execute code in a sandboxed environment."""
        # Validate language
        if language not in allowed_languages:
            return f"Error: Language '{language}' is not allowed. Allowed: {langs_str}"

        # Validate commands
        if validator:
            error = validator.validate(code, language)
            if error:
                return f"Error: {error}"

        # Execute
        if isinstance(executor, LocalCodeExecutor):
            # LocalCodeExecutor is language-specific; create one per invocation
            lang_executor = LocalCodeExecutor(
                language=language,
                timeout=timeout,
                working_dir=executor.working_dir,
            )
            result = lang_executor.execute(code)
        else:
            result = executor.execute(code)

        # Format output
        parts = []
        if result.output:
            parts.append(f"STDOUT:\n{result.output}")
        if result.error:
            parts.append(f"STDERR:\n{result.error}")
        if result.timed_out:
            parts.append(f"TIMED OUT after {timeout}s")
        parts.append(f"Exit code: {result.exit_code}")
        return "\n".join(parts) if parts else "No output."

    # Build dynamic description
    desc = f"Execute code in a sandboxed environment. Supported languages: {langs_str}. Timeout: {timeout}s."
    if allowed_commands:
        desc += f" Allowed shell commands: {', '.join(allowed_commands)}."
    execute_code._tool_def.description = desc

    return execute_code
