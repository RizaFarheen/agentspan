"""Unit tests for the run.py convenience API."""

import sys
from unittest.mock import MagicMock, patch, AsyncMock
import pytest

from agentspan.agents.agent import Agent


def _get_run_module():
    """Get the actual run module (not the run function)."""
    return sys.modules["agentspan.agents.run"]


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Reset the singleton runtime between tests."""
    mod = _get_run_module()
    mod._default_runtime = None
    yield
    mod._default_runtime = None


class TestRunFunction:
    """Test the top-level run() function."""

    def test_run_delegates_to_runtime(self):
        mock_runtime = MagicMock()
        mock_runtime.run.return_value = MagicMock(output="Hello")
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import run
        result = run(agent, "Hi", runtime=mock_runtime)

        mock_runtime.run.assert_called_once()
        assert result.output == "Hello"

    def test_run_passes_kwargs(self):
        mock_runtime = MagicMock()
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import run
        run(agent, "Hi", media=["img.png"], session_id="s1", runtime=mock_runtime)

        call_kwargs = mock_runtime.run.call_args
        assert call_kwargs.kwargs["media"] == ["img.png"]
        assert call_kwargs.kwargs["session_id"] == "s1"


class TestStartFunction:
    """Test the top-level start() function."""

    def test_start_delegates_to_runtime(self):
        mock_runtime = MagicMock()
        mock_runtime.start.return_value = MagicMock(workflow_id="wf-1")
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import start
        handle = start(agent, "Go", runtime=mock_runtime)

        mock_runtime.start.assert_called_once()
        assert handle.workflow_id == "wf-1"


class TestStreamFunction:
    """Test the top-level stream() function."""

    def test_stream_delegates_to_runtime(self):
        mock_runtime = MagicMock()
        mock_event = MagicMock(type="done")
        mock_runtime.stream.return_value = iter([mock_event])
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import stream
        events = list(stream(agent, "Go", runtime=mock_runtime))

        mock_runtime.stream.assert_called_once()
        assert len(events) == 1


class TestPlanFunction:
    """Test the top-level plan() function."""

    def test_plan_delegates_to_runtime(self):
        mock_runtime = MagicMock()
        mock_runtime.plan.return_value = MagicMock(name="test_wf")
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import plan
        result = plan(agent, runtime=mock_runtime)

        mock_runtime.plan.assert_called_once_with(agent)


class TestShutdown:
    """Test the shutdown() function."""

    def test_shutdown_stops_runtime(self):
        mod = _get_run_module()
        mock_rt = MagicMock()
        mod._default_runtime = mock_rt

        mod.shutdown()

        mock_rt.shutdown.assert_called_once()
        assert mod._default_runtime is None

    def test_shutdown_noop_when_no_runtime(self):
        from agentspan.agents.run import shutdown
        # Should not raise
        shutdown()


class TestRunAsyncFunction:
    """Test the top-level run_async() function."""

    @pytest.mark.asyncio
    async def test_run_async_delegates_to_runtime(self):
        mock_runtime = MagicMock()
        mock_runtime.run_async = AsyncMock(return_value=MagicMock(output="Async result"))
        agent = Agent(name="test", model="openai/gpt-4o")

        from agentspan.agents.run import run_async
        result = await run_async(agent, "Hi", runtime=mock_runtime)

        mock_runtime.run_async.assert_called_once()
        assert result.output == "Async result"
