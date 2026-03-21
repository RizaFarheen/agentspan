# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Integration test: isolated=True tool receives credentials in subprocess env."""

import os
from unittest.mock import MagicMock, patch

import pytest

from agentspan.agents.runtime._dispatch import make_tool_worker
from agentspan.agents.tool import tool


def _make_task(input_data=None, ctx_token=None):
    from conductor.client.http.models.task import Task
    t = Task()
    t.input_data = input_data or {}
    if ctx_token:
        t.input_data["__agentspan_ctx__"] = ctx_token
    t.workflow_instance_id = "test-wf-isolated"
    t.task_id = "test-task-isolated"
    return t


class TestIsolatedToolDispatch:
    """isolated=True tool runs in subprocess with env var credentials."""

    def test_isolated_tool_reads_credential_from_env(self):
        """The subprocess has GITHUB_TOKEN in its environment."""

        @tool(isolated=True, credentials=["GITHUB_TOKEN"])
        def read_github_token() -> str:
            """Read GITHUB_TOKEN from subprocess env."""
            import os
            return os.environ.get("GITHUB_TOKEN", "NOT_FOUND")

        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = {"GITHUB_TOKEN": "ghp_subprocess_token"}

        with patch(
            "agentspan.agents.runtime._dispatch._get_credential_fetcher",
            return_value=mock_fetcher,
        ):
            wrapper = make_tool_worker(read_github_token, "read_github_token")
            task = _make_task(ctx_token="exec-token-xyz")
            result = wrapper(task)

        assert result.status == "COMPLETED"
        assert result.output_data.get("result") == "ghp_subprocess_token"

    def test_isolated_tool_credential_not_in_parent_env(self):
        """The isolated credential must NOT appear in parent os.environ."""
        secret_key = "AGENTSPAN_TEST_ISOLATED_SECRET_99999"
        assert secret_key not in os.environ

        @tool(isolated=True, credentials=[secret_key])
        def noop_tool() -> str:
            """Does nothing."""
            return "done"

        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = {secret_key: "super-secret"}

        with patch(
            "agentspan.agents.runtime._dispatch._get_credential_fetcher",
            return_value=mock_fetcher,
        ):
            wrapper = make_tool_worker(noop_tool, "noop_tool")
            task = _make_task(ctx_token="exec-token-xyz")
            wrapper(task)

        # Parent env must be clean
        assert secret_key not in os.environ
