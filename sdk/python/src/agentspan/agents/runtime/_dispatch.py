# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Tool execution workers for native function calling.

This file deliberately does NOT use ``from __future__ import annotations``
because the Conductor worker framework needs real type objects (not strings)
for parameter type resolution.
"""

import inspect
import json
import logging

logger = logging.getLogger("agentspan.agents.dispatch")

# Module-level registry: task_name -> {tool_name: tool_func}
_tool_registry = {}

# Server-side tool registry: tool_name -> {"type": "http"|"mcp", "config": {...}}
_tool_type_registry = {}

# MCP server configs: [{"server_url": ..., "headers": ...}]
_mcp_servers = []

# Per-tool consecutive error count for circuit breaker
_tool_error_counts = {}

# Approval-required flags: tool_name -> bool
_tool_approval_flags = {}

# Maps tool_name -> Conductor task definition name for DynamicTask resolution
_tool_task_names = {}

# Maximum consecutive failures before disabling a tool
_CIRCUIT_BREAKER_THRESHOLD = 3

# Current execution context for ToolContext injection
_current_context = {}


def reset_circuit_breaker(tool_name: str) -> None:
    """Reset the consecutive error count for a specific tool."""
    _tool_error_counts.pop(tool_name, None)


def reset_all_circuit_breakers() -> None:
    """Reset all tool error counts (e.g., between agent runs)."""
    _tool_error_counts.clear()


def _needs_context(func):
    """Check if a function declares a 'context' parameter with ToolContext type."""
    try:
        sig = inspect.signature(func)
        return "context" in sig.parameters
    except (ValueError, TypeError):
        return False


def make_tool_worker(tool_func, tool_name, guardrails=None):
    """Create a Conductor worker wrapper for a @tool function.

    The wrapper accepts a ``Task`` object so it can extract metadata
    (workflow ID) for ``ToolContext`` injection, then maps the task's
    ``inputParameters`` to the tool function's arguments.
    On failure the exception propagates so Conductor marks the task FAILED.

    If *guardrails* are provided, they wrap the tool execution:
    - Pre-execution guardrails check the input parameters.
    - Post-execution guardrails check the tool result.
    """
    # Resolve PEP 563 string annotations (from __future__ import annotations)
    # to real types so downstream code can use isinstance().
    import typing
    try:
        tool_func.__annotations__ = typing.get_type_hints(tool_func)
    except Exception:
        pass

    from conductor.client.http.models import Task, TaskResult
    from conductor.client.http.models.task_result_status import TaskResultStatus

    def _execute(kwargs, wf_id="", agent_state=None):
        """Core execution logic shared by both Task-based and kwargs-based paths."""
        # Circuit breaker: disable tool after N consecutive failures
        if _tool_error_counts.get(tool_name, 0) >= _CIRCUIT_BREAKER_THRESHOLD:
            raise RuntimeError(
                f"Tool '{tool_name}' disabled after {_CIRCUIT_BREAKER_THRESHOLD} "
                "consecutive failures (circuit breaker open)"
            )

        ctx = None
        if _needs_context(tool_func):
            from agentspan.agents.tool import ToolContext
            state = dict(agent_state) if agent_state else {}
            ctx = ToolContext(
                workflow_id=wf_id,
                agent_name=_current_context.get("agent_name", ""),
                session_id=_current_context.get("session_id", ""),
                metadata=_current_context.get("metadata", {}),
                dependencies=_current_context.get("dependencies", {}),
                state=state,
            )
            kwargs["context"] = ctx

        # Pre-execution guardrails: check input parameters
        if guardrails:
            input_str = json.dumps(kwargs, default=str)
            for guard in guardrails:
                if guard.position == "input":
                    check_result = guard.check(input_str)
                    if not check_result.passed:
                        if guard.on_fail == "raise":
                            raise ValueError(
                                f"Tool guardrail '{guard.name}' blocked execution: "
                                f"{check_result.message}"
                            )
                        return {
                            "error": f"Blocked by guardrail '{guard.name}': {check_result.message}",
                            "blocked": True,
                        }

        result = tool_func(**kwargs)

        # Post-execution guardrails: check tool result
        if guardrails:
            result_str = json.dumps(result, default=str) if not isinstance(result, str) else result
            for guard in guardrails:
                if guard.position == "output":
                    check_result = guard.check(result_str)
                    if not check_result.passed:
                        if guard.on_fail == "fix" and check_result.fixed_output is not None:
                            result = check_result.fixed_output
                            result_str = json.dumps(result, default=str) if not isinstance(result, str) else result
                        elif guard.on_fail == "raise":
                            raise ValueError(
                                f"Tool guardrail '{guard.name}' failed: "
                                f"{check_result.message}"
                            )
                        else:
                            result = {
                                "error": f"Output blocked by guardrail '{guard.name}': {check_result.message}",
                                "blocked": True,
                            }

        # Capture ToolContext.state mutations for server-side persistence
        if ctx is not None and ctx.state:
            state_updates = dict(ctx.state)
            if isinstance(result, dict):
                result["_state_updates"] = state_updates
            else:
                result = {"result": result, "_state_updates": state_updates}

        _tool_error_counts[tool_name] = 0
        return result

    def tool_worker(task: Task) -> TaskResult:
        """Worker wrapper that receives a Task object from Conductor.

        The Conductor Python SDK detects the ``Task`` type annotation and
        passes the full Task object instead of unpacking input_data as kwargs.
        This ensures we always receive ``_agent_state`` and other injected
        fields that aren't part of the original tool function's signature.
        """
        task_result = TaskResult(
            task_id=task.task_id,
            workflow_instance_id=task.workflow_instance_id,
            worker_id="agent-sdk",
        )
        try:
            # Extract server-side agent state (injected by enrichment script)
            agent_state = task.input_data.pop("_agent_state", None) or {}

            # Map task input to function kwargs
            sig = inspect.signature(tool_func)
            fn_kwargs = {}
            for param_name in sig.parameters:
                if param_name == "context":
                    continue
                if param_name in task.input_data:
                    fn_kwargs[param_name] = task.input_data[param_name]
                elif sig.parameters[param_name].default is not inspect.Parameter.empty:
                    fn_kwargs[param_name] = sig.parameters[param_name].default
                else:
                    fn_kwargs[param_name] = None

            result = _execute(fn_kwargs, wf_id=task.workflow_instance_id or "", agent_state=agent_state)

            if isinstance(result, dict):
                task_result.output_data = result
            else:
                task_result.output_data = {"result": result}
            task_result.status = TaskResultStatus.COMPLETED
            return task_result
        except Exception as e:
            _tool_error_counts[tool_name] = _tool_error_counts.get(tool_name, 0) + 1
            logger.error("Tool '%s' failed (count=%d): %s", tool_name, _tool_error_counts[tool_name], e)
            task_result.status = TaskResultStatus.FAILED
            task_result.reason_for_incompletion = str(e)
            return task_result

    tool_worker.__name__ = tool_func.__name__
    tool_worker.__qualname__ = tool_func.__qualname__
    tool_worker.__doc__ = tool_func.__doc__
    return tool_worker


# ── Native function calling workers ─────────────────────────────────────


def check_approval_worker(tool_calls: object = None, _unused: str = "") -> object:
    """Check whether any tool in the batch requires human approval.

    Looks up each tool name in the ``_tool_approval_flags`` registry.
    Returns ``{needs_approval: True/False}``.
    """
    tool_calls = tool_calls or []
    for tc in tool_calls:
        name = tc.get("name", "")
        if _tool_approval_flags.get(name, False):
            return {"needs_approval": True}
    return {"needs_approval": False}
