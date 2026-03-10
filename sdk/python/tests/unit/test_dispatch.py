"""Unit tests for the dispatch module workers.

Tests cover the native-FC workers: check_approval_worker and make_tool_worker.
"""

import json

import pytest

from agentspan.agents.runtime._dispatch import (
    check_approval_worker,
    _tool_registry,
    _tool_type_registry,
    _tool_task_names,
    _tool_approval_flags,
    _mcp_servers,
)


# ── helpers ──────────────────────────────────────────────────────────────

def _register_tools(name: str, funcs: dict):
    """Register tools under a fake task name and populate _tool_task_names."""
    _tool_registry[name] = funcs
    for fn_name in funcs:
        _tool_task_names[fn_name] = fn_name


@pytest.fixture(autouse=True)
def _clean_registry():
    """Clear all global registries between tests."""
    _tool_registry.clear()
    _tool_type_registry.clear()
    _tool_task_names.clear()
    _tool_approval_flags.clear()
    _mcp_servers.clear()
    yield
    _tool_registry.clear()
    _tool_type_registry.clear()
    _tool_task_names.clear()
    _tool_approval_flags.clear()
    _mcp_servers.clear()


# ── tests: check_approval_worker (native FC) ────────────────────────────

class TestCheckApprovalWorker:
    """Test check_approval_worker — checks _tool_approval_flags for any tool in batch."""

    def test_approval_required_single(self):
        _tool_approval_flags["danger"] = True
        result = check_approval_worker(tool_calls=[{"name": "danger"}])
        assert result["needs_approval"] is True

    def test_approval_required_in_batch(self):
        _tool_approval_flags["danger"] = True
        result = check_approval_worker(tool_calls=[
            {"name": "safe_tool"},
            {"name": "danger"},
        ])
        assert result["needs_approval"] is True

    def test_no_approval(self):
        result = check_approval_worker(tool_calls=[{"name": "safe_tool"}])
        assert result["needs_approval"] is False

    def test_empty_tool_calls(self):
        result = check_approval_worker(tool_calls=[])
        assert result["needs_approval"] is False

    def test_none_tool_calls(self):
        result = check_approval_worker(tool_calls=None)
        assert result["needs_approval"] is False
