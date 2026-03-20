# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

# sdk/python/tests/unit/test_claude_worker.py
"""Tests for make_claude_worker — the Tier 1/2 passthrough worker factory."""

from unittest.mock import MagicMock, patch

from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker
from agentspan.agents.runtime.runtime import AgentRuntime


def _make_task(prompt="hello", cwd=".", workflow_id="wf-123"):
    task = MagicMock()
    task.workflow_instance_id = workflow_id
    task.input_data = {"prompt": prompt, "cwd": cwd}
    return task


class TestMakeClaudeWorker:
    def test_returns_callable(self):
        agent = ClaudeCodeAgent(name="test", allowed_tools=["Read"])
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost", "", "")
        assert callable(worker)

    def test_worker_uses_prompt_from_task(self):
        """Worker passes task prompt to query()."""
        agent = ClaudeCodeAgent(name="test", allowed_tools=["Read"])
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost", "", "")

        captured_prompts = []

        async def fake_query(prompt, options):
            captured_prompts.append(prompt)
            yield MagicMock(subtype="init", session_id="sess-001")
            result = MagicMock()
            result.__class__.__name__ = "ResultMessage"
            result.result = "done"
            yield result

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            task = _make_task(prompt="fix the bug", cwd="/workspace")
            worker(task)

        assert captured_prompts == ["fix the bug"]

    def test_worker_returns_completed_on_success(self):
        agent = ClaudeCodeAgent(name="test")
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost", "", "")

        async def fake_query(prompt, options):
            yield MagicMock(subtype="init", session_id="sess-001")
            result = MagicMock()
            result.__class__.__name__ = "ResultMessage"
            result.result = "task result"
            yield result

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            task = _make_task()
            task_result = worker(task)

        assert task_result.status.name == "COMPLETED"
        assert task_result.output_data["result"] == "task result"

    def test_worker_returns_failed_on_exception(self):
        agent = ClaudeCodeAgent(name="test")
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost", "", "")

        async def fake_query(prompt, options):
            raise RuntimeError("SDK crashed")
            yield  # make it a generator

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
        ):
            task = _make_task()
            task_result = worker(task)

        assert task_result.status.name == "FAILED"

    def test_pre_tool_hook_pushes_tool_call_event(self):
        """PreToolUse hook calls _push_event_nonblocking with tool_call type."""
        agent = ClaudeCodeAgent(name="test", allowed_tools=["Bash"])
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost:8080", "", "")

        captured_events = []

        async def fake_query(prompt, options):
            # Simulate PreToolUse hook firing
            hook = options.hooks["PreToolUse"][0].hooks[0]
            input_data = {"tool_name": "Bash", "tool_input": {"command": "ls"}}
            await hook(input_data, "tu-001", {})

            yield MagicMock(subtype="init", session_id="sess-001")
            result = MagicMock()
            result.__class__.__name__ = "ResultMessage"
            result.result = "done"
            yield result

        def fake_push(workflow_id, event_type, payload, server_url, headers):
            captured_events.append((event_type, payload))

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
            patch("agentspan.agents.frameworks.claude._push_event_nonblocking", fake_push),
        ):
            worker(_make_task())

        assert any(e[0] == "tool_call" and e[1]["toolName"] == "Bash" for e in captured_events)

    def test_session_id_pre_populated_from_restore(self):
        """session_id_ref is pre-populated from restored session so first PostToolUse
        checkpoint works even if SDK skips re-emitting SystemMessage(init)."""
        agent = ClaudeCodeAgent(name="test")
        worker = make_claude_worker(agent, "_fw_claude_test", "http://localhost:8080", "", "")

        checkpointed_with = []

        async def fake_query(prompt, options):
            # Simulate PostToolUse without prior init message (resume scenario)
            hook = options.hooks["PostToolUse"][0].hooks[0]
            input_data = {
                "tool_name": "Read",
                "tool_input": {"file_path": "a.py"},
                "tool_response": "content",
            }
            await hook(input_data, "tu-002", {})

            result = MagicMock()
            result.__class__.__name__ = "ResultMessage"
            result.result = "done"
            yield result

        def fake_checkpoint(wf_id, session_id, cwd, server_url, headers):
            checkpointed_with.append(session_id)

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch(
                "agentspan.agents.frameworks.claude._restore_session",
                return_value="restored-session-id",
            ),
            patch("agentspan.agents.frameworks.claude._checkpoint_session", fake_checkpoint),
            patch("agentspan.agents.frameworks.claude._push_event_nonblocking"),
        ):
            worker(_make_task())

        # Must checkpoint with the restored session ID, not None
        assert all(s == "restored-session-id" for s in checkpointed_with)
        assert len(checkpointed_with) >= 1


class TestRuntimePassthroughDispatch:
    def test_build_passthrough_func_handles_claude(self):
        """_build_passthrough_func must not raise ValueError for 'claude'."""
        agent = ClaudeCodeAgent(name="rt_test", allowed_tools=["Read"])
        runtime = AgentRuntime.__new__(AgentRuntime)
        runtime._config = MagicMock()
        runtime._config.server_url = "http://localhost:8080"
        runtime._config.auth_key = ""
        runtime._config.auth_secret = ""

        func = runtime._build_passthrough_func(agent, "claude", "_fw_claude_rt_test")
        assert callable(func)
