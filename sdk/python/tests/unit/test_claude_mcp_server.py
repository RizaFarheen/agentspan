# sdk/python/tests/unit/test_claude_mcp_server.py
# Copyright (c) 2025 Agentspan
"""Tests for AgentspanMcpServer — simplified local-execution MCP bridge."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

from agentspan.agents.frameworks.claude_mcp_server import AgentspanMcpServer


def _make_tool(name: str, description: str = "Test tool"):
    """Build a minimal @tool-decorated callable."""
    def tool_fn(x: str) -> str:
        return f"{name}:{x}"

    td = MagicMock()
    td.name = name
    td.description = description
    tool_fn._tool_def = td
    tool_fn.__annotations__ = {"x": str, "return": str}
    return tool_fn


class TestBuild:
    def test_returns_sdk_config_dict(self):
        server = AgentspanMcpServer(tools=[])
        config = server.build()
        assert config["type"] == "sdk"
        assert config["name"] == "agentspan"
        assert config["instance"] is not None

    def test_registers_tools(self):
        tool = _make_tool("my_tool")
        server = AgentspanMcpServer(tools=[tool])
        config = server.build()
        mcp = config["instance"]
        # FastMCP stores tools in _tool_manager
        tool_names = list(mcp._tool_manager._tools.keys())
        assert "my_tool" in tool_names

    def test_skips_tool_without_tool_def(self):
        def bare_fn(x: str) -> str:
            return x
        # No _tool_def attribute

        server = AgentspanMcpServer(tools=[bare_fn])
        config = server.build()  # must not raise
        mcp = config["instance"]
        # bare_fn should NOT be registered
        assert "bare_fn" not in mcp._tool_manager._tools

    def test_patches_request_handlers_on_mcp(self):
        """Compatibility shim: request_handlers is accessible on the returned instance."""
        server = AgentspanMcpServer(tools=[])
        config = server.build()
        mcp = config["instance"]
        assert hasattr(mcp, "request_handlers")

    def test_patches_version_on_mcp(self):
        """Compatibility shim: version is accessible on the returned instance."""
        server = AgentspanMcpServer(tools=[])
        config = server.build()
        mcp = config["instance"]
        assert hasattr(mcp, "version")
        assert mcp.version is not None


class TestLocalExecution:
    def test_tool_executes_locally_via_to_thread(self):
        """Wrapper calls tool_fn in a thread (asyncio.to_thread), not Conductor."""
        call_log = []

        def echo_tool(msg: str) -> str:
            """Echo."""
            call_log.append(msg)
            return f"echo:{msg}"

        td = MagicMock()
        td.name = "echo_tool"
        td.description = "Echo."
        echo_tool._tool_def = td
        echo_tool.__annotations__ = {"msg": str, "return": str}

        server = AgentspanMcpServer(tools=[echo_tool])
        config = server.build()
        mcp = config["instance"]

        # Get the wrapper from FastMCP internals
        tool_fn = None
        for tool in mcp._tool_manager._tools.values():
            if tool.name == "echo_tool":
                tool_fn = tool.fn
                break

        assert tool_fn is not None
        result = asyncio.run(tool_fn(msg="hello"))
        assert result == "echo:hello"
        assert call_log == ["hello"]

    def test_tool_wrapper_has_correct_signature(self):
        """_mcp_wrapper preserves original function signature for FastMCP schema."""
        import inspect

        def my_tool(name: str, count: int) -> str:
            return f"{name}:{count}"

        td = MagicMock()
        td.name = "my_tool"
        td.description = "My tool."
        my_tool._tool_def = td
        my_tool.__annotations__ = {"name": str, "count": int, "return": str}

        server = AgentspanMcpServer(tools=[my_tool])
        config = server.build()
        mcp = config["instance"]

        tool_obj = mcp._tool_manager._tools.get("my_tool")
        assert tool_obj is not None
        sig = inspect.signature(tool_obj.fn)
        assert "name" in sig.parameters
        assert "count" in sig.parameters

    def test_no_spawn_subagent_tool_registered(self):
        """spawn_subagent is NOT registered (removed from simplified server)."""
        server = AgentspanMcpServer(tools=[])
        config = server.build()
        mcp = config["instance"]
        assert "spawn_subagent" not in mcp._tool_manager._tools
