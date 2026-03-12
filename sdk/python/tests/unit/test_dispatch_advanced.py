# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Unit tests for advanced dispatch features — circuit breaker,
make_tool_worker, and ToolContext injection.
"""

import json

import pytest

from agentspan.agents.runtime._dispatch import (
    make_tool_worker,
    _tool_registry,
    _tool_type_registry,
    _tool_task_names,
    _mcp_servers,
    _tool_error_counts,
    _tool_approval_flags,
    _current_context,
)


# ── helpers ──────────────────────────────────────────────────────────────

def _register_tools(name: str, funcs: dict):
    _tool_registry[name] = funcs
    for fn_name in funcs:
        _tool_task_names[fn_name] = fn_name


def _make_task(input_data=None, workflow_instance_id="test-wf-001", task_id="test-task-001"):
    """Create a minimal mock Task for testing make_tool_worker."""
    from conductor.client.http.models.task import Task
    t = Task()
    t.input_data = input_data or {}
    t.workflow_instance_id = workflow_instance_id
    t.task_id = task_id
    return t


@pytest.fixture(autouse=True)
def _clean_state():
    """Clear all global state between tests."""
    _tool_registry.clear()
    _tool_type_registry.clear()
    _tool_task_names.clear()
    _mcp_servers.clear()
    _tool_error_counts.clear()
    _tool_approval_flags.clear()
    _current_context.clear()
    yield
    _tool_registry.clear()
    _tool_type_registry.clear()
    _tool_task_names.clear()
    _mcp_servers.clear()
    _tool_error_counts.clear()
    _tool_approval_flags.clear()
    _current_context.clear()


# ── Circuit breaker ──────────────────────────────────────────────────────

class TestCircuitBreaker:
    """Test that make_tool_worker tracks error counts for circuit breaking."""

    def test_make_tool_worker_increments_error_count(self):
        """make_tool_worker returns FAILED TaskResult and increments error count."""
        def bad_tool():
            raise RuntimeError("boom")

        wrapper = make_tool_worker(bad_tool, "bad_tool")
        result = wrapper(_make_task())
        assert result.status == "FAILED"
        assert _tool_error_counts["bad_tool"] == 1

    def test_make_tool_worker_resets_on_success(self):
        _tool_error_counts["good"] = 2
        wrapper = make_tool_worker(lambda: "ok", "good")
        result = wrapper(_make_task())
        assert result.status == "COMPLETED"
        assert _tool_error_counts["good"] == 0

    def test_consecutive_failures_increment(self):
        """Error count increments on each consecutive failure."""
        def flaky():
            raise ValueError("fail")

        wrapper = make_tool_worker(flaky, "flaky")
        for i in range(3):
            result = wrapper(_make_task())
            assert result.status == "FAILED"
        assert _tool_error_counts["flaky"] == 3


# ── ToolContext injection ───────────────────────────────────────────────

class TestToolContext:
    """Test ToolContext injection via make_tool_worker."""

    def test_context_injected_via_make_tool_worker(self):
        from agentspan.agents.tool import ToolContext

        received_ctx = {}

        def tool_with_context(context: ToolContext, query: str) -> str:
            received_ctx["agent"] = context.agent_name
            received_ctx["session"] = context.session_id
            received_ctx["workflow_id"] = context.workflow_id
            return f"result for {query}"

        _current_context.update({
            "agent_name": "test_agent",
            "session_id": "session_123",
        })

        wrapper = make_tool_worker(tool_with_context, "ctx_tool")
        task = _make_task(input_data={"query": "test"}, workflow_instance_id="wf-ctx-test")
        result = wrapper(task)

        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "result for test"}
        assert received_ctx["agent"] == "test_agent"
        assert received_ctx["session"] == "session_123"
        assert received_ctx["workflow_id"] == "wf-ctx-test"

    def test_no_context_param_via_make_tool_worker(self):
        def plain_tool(x: str) -> str:
            return x.upper()

        wrapper = make_tool_worker(plain_tool, "plain")
        task = _make_task(input_data={"x": "hello"})
        result = wrapper(task)
        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "HELLO"}

    def test_context_state_from_task_input(self):
        """ToolContext.state should be populated from _agent_state in task input."""
        from agentspan.agents.tool import ToolContext

        def write_tool(key: str, value: str, context: ToolContext = None) -> dict:
            context.state[key] = value
            return {"written": key}

        wrapper = make_tool_worker(write_tool, "write_tool")
        # _agent_state is injected by the enrichment script on the server
        task = _make_task(
            input_data={"key": "color", "value": "blue", "_agent_state": {"existing": "data"}},
            workflow_instance_id="wf-state-test",
        )
        result = wrapper(task)
        assert result.status == "COMPLETED"
        # State updates should be in output for server-side persistence
        assert "_state_updates" in result.output_data
        assert result.output_data["_state_updates"]["color"] == "blue"
        assert result.output_data["_state_updates"]["existing"] == "data"

    def test_context_state_empty_when_no_agent_state(self):
        """ToolContext.state should be empty dict when _agent_state is not in task input."""
        from agentspan.agents.tool import ToolContext

        def read_tool(key: str, context: ToolContext = None) -> dict:
            return {"value": context.state.get(key, "NOT_FOUND")}

        wrapper = make_tool_worker(read_tool, "read_tool")
        task = _make_task(input_data={"key": "x"}, workflow_instance_id="wf-1")
        result = wrapper(task)
        assert result.status == "COMPLETED"
        assert result.output_data == {"value": "NOT_FOUND"}

    def test_state_updates_in_output(self):
        """Tools that modify state should include _state_updates in output."""
        from agentspan.agents.tool import ToolContext

        def multi_write(context: ToolContext = None) -> str:
            context.state["a"] = 1
            context.state["b"] = 2
            return "done"

        wrapper = make_tool_worker(multi_write, "multi_write")
        task = _make_task(input_data={"_agent_state": {}})
        result = wrapper(task)
        assert result.status == "COMPLETED"
        assert result.output_data["_state_updates"] == {"a": 1, "b": 2}
        assert result.output_data["result"] == "done"


# ── make_tool_worker factory ─────────────────────────────────────────

class TestMakeToolWorker:
    """Test make_tool_worker() — wraps execution, returns TaskResult."""

    def test_basic_execution(self):
        def my_tool(city: str) -> dict:
            return {"temp": 72, "city": city}

        wrapper = make_tool_worker(my_tool, "my_tool")
        result = wrapper(_make_task(input_data={"city": "NYC"}))
        assert result.status == "COMPLETED"
        assert result.output_data == {"temp": 72, "city": "NYC"}

    def test_string_result(self):
        def echo(msg: str) -> str:
            return f"Echo: {msg}"

        wrapper = make_tool_worker(echo, "echo")
        result = wrapper(_make_task(input_data={"msg": "hello"}))
        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "Echo: hello"}

    def test_error_returns_failed_result(self):
        """Tool errors should return FAILED TaskResult."""
        def bad_tool():
            raise RuntimeError("boom")

        wrapper = make_tool_worker(bad_tool, "bad_tool")
        result = wrapper(_make_task())
        assert result.status == "FAILED"
        assert "boom" in result.reason_for_incompletion
        assert _tool_error_counts["bad_tool"] == 1

    def test_success_resets_error_count(self):
        _tool_error_counts["good"] = 2

        wrapper = make_tool_worker(lambda: "ok", "good")
        result = wrapper(_make_task())
        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "ok"}
        assert _tool_error_counts["good"] == 0

    def test_preserves_function_name(self):
        def get_weather(city: str, units: str = "F") -> dict:
            return {"city": city}

        wrapper = make_tool_worker(get_weather, "get_weather")
        assert wrapper.__name__ == "get_weather"


# ── Guardrail integration with make_tool_worker ────────────────────────


class _MockGuardrail:
    """Minimal guardrail mock for testing make_tool_worker guardrail paths."""
    def __init__(self, position, on_fail, passed=True, message="", fixed_output=None):
        self.position = position
        self.on_fail = on_fail
        self.name = "mock_guard"
        self._passed = passed
        self._message = message
        self._fixed_output = fixed_output

    def check(self, content):
        from agentspan.agents.guardrail import GuardrailResult
        return GuardrailResult(
            passed=self._passed,
            message=self._message,
            fixed_output=self._fixed_output,
        )


class TestMakeToolWorkerGuardrails:
    """Test guardrail integration in make_tool_worker."""

    def test_pre_guardrail_blocks_with_raise(self):
        guard = _MockGuardrail(position="input", on_fail="raise", passed=False, message="bad input")

        def my_tool(x: str) -> str:
            return x

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task(input_data={"x": "hello"}))
        # Raise guardrails now return FAILED TaskResult
        assert result.status == "FAILED"
        assert "blocked execution" in result.reason_for_incompletion

    def test_pre_guardrail_blocks_with_error_dict(self):
        guard = _MockGuardrail(position="input", on_fail="retry", passed=False, message="bad input")

        def my_tool(x: str) -> str:
            return x

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task(input_data={"x": "hello"}))
        assert result.status == "COMPLETED"
        assert result.output_data["blocked"] is True
        assert "Blocked by guardrail" in result.output_data["error"]

    def test_pre_guardrail_passes(self):
        guard = _MockGuardrail(position="input", on_fail="raise", passed=True)

        def my_tool(x: str) -> str:
            return x.upper()

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task(input_data={"x": "hello"}))
        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "HELLO"}

    def test_post_guardrail_fix_replaces_result(self):
        guard = _MockGuardrail(
            position="output", on_fail="fix", passed=False,
            message="needs fix", fixed_output="FIXED",
        )

        def my_tool() -> str:
            return "original"

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task())
        assert result.status == "COMPLETED"
        assert result.output_data == {"result": "FIXED"}

    def test_post_guardrail_raise(self):
        guard = _MockGuardrail(position="output", on_fail="raise", passed=False, message="bad output")

        def my_tool() -> str:
            return "original"

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task())
        assert result.status == "FAILED"
        assert "failed" in result.reason_for_incompletion.lower()

    def test_post_guardrail_sanitize(self):
        guard = _MockGuardrail(position="output", on_fail="retry", passed=False, message="unsafe output")

        def my_tool() -> str:
            return "original"

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task())
        assert result.status == "COMPLETED"
        assert result.output_data["blocked"] is True
        assert "blocked by guardrail" in result.output_data["error"].lower()

    def test_post_guardrail_passes(self):
        guard = _MockGuardrail(position="output", on_fail="raise", passed=True)

        def my_tool() -> dict:
            return {"key": "value"}

        wrapper = make_tool_worker(my_tool, "guarded", guardrails=[guard])
        result = wrapper(_make_task())
        assert result.status == "COMPLETED"
        assert result.output_data == {"key": "value"}


class TestNeedsContext:
    """Test _needs_context helper for edge cases."""

    def test_exception_returns_false(self):
        from agentspan.agents.runtime._dispatch import _needs_context
        # Pass something that's not a function
        assert _needs_context(42) is False
