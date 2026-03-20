# tests/integration/test_claude_mcp_integration.py
"""Layer 2 integration tests: real make_claude_worker + real AgentspanMcpServer, mocked query().

These tests verify the wiring between ClaudeCodeAgent → make_claude_worker → AgentspanMcpServer
→ ClaudeAgentOptions without needing real Conductor or real Claude.

Run with: uv run pytest tests/integration/test_claude_mcp_integration.py -v
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SERVER_URL = os.environ.get("AGENTSPAN_SERVER_URL", "http://localhost:8080/api")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_echo_tool():
    def echo_fn(message: str) -> str:
        """Echo the message."""
        return f"echo:{message}"

    td = MagicMock()
    td.name = "echo_tool"
    td.description = "Echo the message."
    td.input_schema = {
        "type": "object",
        "properties": {"message": {"type": "string"}},
        "required": ["message"],
    }
    echo_fn._tool_def = td
    return echo_fn


def _make_fake_query(result="done"):
    async def _gen(*args, **kwargs):
        init = MagicMock()
        init.__class__.__name__ = "SystemMessage"
        init.subtype = "init"
        init.data = {"session_id": "integ-sess-001"}
        yield init

        rm = MagicMock()
        rm.__class__.__name__ = "ResultMessage"
        rm.result = result
        yield rm

    return _gen


def _make_task(workflow_id="wf-integ-001", is_subagent=False):
    task = MagicMock()
    task.workflow_instance_id = workflow_id
    task.task_id = "task-001"
    task.input_data = {"prompt": "test", "cwd": "/tmp"}
    if is_subagent:
        task.input_data["_is_subagent"] = True
    return task


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestMcpServerWiresIntoOptions:
    """Verify that make_claude_worker correctly passes mcp_servers to ClaudeAgentOptions."""

    def test_mcp_server_config_passed_to_query(self):
        """When mcp_tools set, McpSdkServerConfig is passed into ClaudeAgentOptions."""
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        echo_tool = _make_echo_tool()
        agent = ClaudeCodeAgent(
            name="integ_test",
            mcp_tools=[echo_tool],
            conductor_subagents=False,
        )
        worker = make_claude_worker(agent, "_fw_claude_integ_test", SERVER_URL, "", "")

        captured_options = {}

        async def fake_query(prompt, options, **kwargs):
            captured_options["options"] = options
            init = MagicMock()
            init.__class__.__name__ = "SystemMessage"
            init.subtype = "init"
            init.data = {"session_id": "sess-x"}
            yield init
            rm = MagicMock()
            rm.__class__.__name__ = "ResultMessage"
            rm.result = "done"
            yield rm

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            worker(_make_task())

        assert hasattr(captured_options["options"], "mcp_servers")
        assert "agentspan" in captured_options["options"].mcp_servers
        config = captured_options["options"].mcp_servers["agentspan"]
        assert config["type"] == "sdk"
        assert config["name"] == "agentspan"

    def test_no_mcp_servers_for_plain_tier1_agent(self):
        """Plain ClaudeCodeAgent (no mcp_tools, no conductor_subagents) has no mcp_servers in options."""
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        agent = ClaudeCodeAgent(name="plain_test")
        worker = make_claude_worker(agent, "_fw_claude_plain_test", SERVER_URL, "", "")

        captured_options = {}

        async def fake_query(prompt, options, **kwargs):
            captured_options["options"] = options
            init = MagicMock()
            init.__class__.__name__ = "SystemMessage"
            init.subtype = "init"
            init.data = {"session_id": "sess-y"}
            yield init
            rm = MagicMock()
            rm.__class__.__name__ = "ResultMessage"
            rm.result = "done"
            yield rm

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            worker(_make_task())

        assert not getattr(captured_options["options"], "mcp_servers", {})

    def test_mcp_instance_is_fastmcp(self):
        """The MCP server instance in the config is a FastMCP object."""
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        echo_tool = _make_echo_tool()
        agent = ClaudeCodeAgent(name="integ_fastmcp", mcp_tools=[echo_tool])
        worker = make_claude_worker(agent, "_fw_claude_integ_fastmcp", SERVER_URL, "", "")

        captured_options = {}

        async def fake_query(prompt, options, **kwargs):
            captured_options["options"] = options
            init = MagicMock()
            init.__class__.__name__ = "SystemMessage"
            init.subtype = "init"
            init.data = {"session_id": "sess-z"}
            yield init
            rm = MagicMock()
            rm.__class__.__name__ = "ResultMessage"
            rm.result = "done"
            yield rm

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            worker(_make_task())

        from mcp.server.fastmcp import FastMCP
        config = captured_options["options"].mcp_servers["agentspan"]
        assert isinstance(config["instance"], FastMCP)


class TestSubagentWiring:
    """Verify conductor_subagents=True wires spawn_subagent correctly."""

    def test_subagent_workflow_name_passed_to_mcp_server(self):
        """conductor_subagents=True passes worker name as subagent_workflow_name."""
        import agentspan.agents.frameworks.claude_mcp_server as mcp_mod
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        agent = ClaudeCodeAgent(name="sub_test", conductor_subagents=True)
        worker = make_claude_worker(agent, "_fw_claude_sub_test", SERVER_URL, "", "")

        init_calls = []
        orig_init = mcp_mod.AgentspanMcpServer.__init__

        def capturing_init(self, **kwargs):
            init_calls.append(kwargs)
            orig_init(self, **kwargs)

        with (
            patch("agentspan.agents.frameworks.claude.query", _make_fake_query("done")),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
            patch.object(mcp_mod.AgentspanMcpServer, "__init__", capturing_init),
            patch.object(
                mcp_mod.AgentspanMcpServer, "build",
                return_value={"type": "sdk", "name": "agentspan", "instance": MagicMock()},
            ),
        ):
            worker(_make_task())

        assert len(init_calls) == 1
        assert init_calls[0]["subagent_workflow_name"] == "_fw_claude_sub_test"

    def test_is_subagent_flag_skips_mcp_server(self):
        """_is_subagent=True in task input skips MCP server creation."""
        import agentspan.agents.frameworks.claude_mcp_server as mcp_mod
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        agent = ClaudeCodeAgent(name="sub_test", conductor_subagents=True)
        worker = make_claude_worker(agent, "_fw_claude_sub_test", SERVER_URL, "", "")

        with (
            patch("agentspan.agents.frameworks.claude.query", _make_fake_query("done")),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
            patch.object(mcp_mod, "AgentspanMcpServer") as MockServer,
        ):
            worker(_make_task(is_subagent=True))
            MockServer.assert_not_called()

    def test_spawn_subagent_tool_in_mcp_server(self):
        """conductor_subagents=True registers spawn_subagent tool in the MCP server."""
        from agentspan.agents.frameworks.claude import ClaudeCodeAgent, make_claude_worker

        agent = ClaudeCodeAgent(name="sub_tool_test", conductor_subagents=True)
        worker = make_claude_worker(agent, "_fw_claude_sub_tool_test", SERVER_URL, "", "")

        captured_options = {}

        async def fake_query(prompt, options, **kwargs):
            captured_options["options"] = options
            init = MagicMock()
            init.__class__.__name__ = "SystemMessage"
            init.subtype = "init"
            init.data = {"session_id": "sess-sub"}
            yield init
            rm = MagicMock()
            rm.__class__.__name__ = "ResultMessage"
            rm.result = "done"
            yield rm

        with (
            patch("agentspan.agents.frameworks.claude.query", fake_query),
            patch("agentspan.agents.frameworks.claude._restore_session", return_value=None),
            patch("agentspan.agents.frameworks.claude._checkpoint_session"),
        ):
            worker(_make_task())

        config = captured_options["options"].mcp_servers["agentspan"]
        mcp = config["instance"]
        tool_names = [t.name for t in mcp._tool_manager.list_tools()]
        assert "spawn_subagent" in tool_names
