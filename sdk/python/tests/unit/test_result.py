# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Unit tests for result types."""

from unittest.mock import MagicMock

from agentspan.agents.result import (
    AgentEvent,
    AgentHandle,
    AgentResult,
    AgentStatus,
    EventType,
    FinishReason,
    Status,
    TokenUsage,
    _build_result_from_events,
)


class TestTokenUsage:
    """Test TokenUsage dataclass."""

    def test_defaults(self):
        usage = TokenUsage()
        assert usage.prompt_tokens == 0
        assert usage.completion_tokens == 0
        assert usage.total_tokens == 0

    def test_with_values(self):
        usage = TokenUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150)
        assert usage.prompt_tokens == 100
        assert usage.completion_tokens == 50
        assert usage.total_tokens == 150


class TestAgentResult:
    """Test AgentResult dataclass."""

    def test_defaults(self):
        result = AgentResult()
        assert result.output is None
        assert result.workflow_id == ""
        assert result.messages == []
        assert result.tool_calls == []
        assert result.status == "COMPLETED"
        assert result.token_usage is None

    def test_with_values(self):
        result = AgentResult(
            output="Hello!",
            workflow_id="wf-123",
            messages=[{"role": "user", "message": "Hi"}],
            tool_calls=[{"name": "test", "input": {}, "output": {}}],
            status="COMPLETED",
        )
        assert result.output == "Hello!"
        assert result.workflow_id == "wf-123"
        assert len(result.messages) == 1
        assert len(result.tool_calls) == 1

    def test_with_token_usage(self):
        usage = TokenUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150)
        result = AgentResult(output="Hi", token_usage=usage)
        assert result.token_usage is not None
        assert result.token_usage.total_tokens == 150


class TestAgentStatus:
    """Test AgentStatus dataclass."""

    def test_defaults(self):
        status = AgentStatus()
        assert status.is_complete is False
        assert status.is_running is False
        assert status.is_waiting is False

    def test_running(self):
        status = AgentStatus(is_running=True, status="RUNNING")
        assert status.is_running is True
        assert status.is_complete is False

    def test_waiting(self):
        status = AgentStatus(is_waiting=True, status="PAUSED")
        assert status.is_waiting is True


class TestAgentEvent:
    """Test AgentEvent dataclass."""

    def test_thinking_event(self):
        event = AgentEvent(type=EventType.THINKING, content="Processing...")
        assert event.type == "thinking"
        assert event.content == "Processing..."

    def test_tool_call_event(self):
        event = AgentEvent(
            type=EventType.TOOL_CALL,
            tool_name="get_weather",
            args={"city": "NYC"},
        )
        assert event.type == "tool_call"
        assert event.tool_name == "get_weather"

    def test_done_event(self):
        event = AgentEvent(
            type=EventType.DONE,
            output="Final answer",
            workflow_id="wf-123",
        )
        assert event.type == "done"
        assert event.output == "Final answer"

    def test_guardrail_pass_event(self):
        event = AgentEvent(
            type=EventType.GUARDRAIL_PASS,
            guardrail_name="no_pii",
            workflow_id="wf-456",
        )
        assert event.type == "guardrail_pass"
        assert event.guardrail_name == "no_pii"

    def test_guardrail_fail_event(self):
        event = AgentEvent(
            type=EventType.GUARDRAIL_FAIL,
            guardrail_name="safety_check",
            content="Contains harmful content",
            workflow_id="wf-456",
        )
        assert event.type == "guardrail_fail"
        assert event.guardrail_name == "safety_check"
        assert event.content == "Contains harmful content"

    def test_guardrail_name_default_none(self):
        event = AgentEvent(type=EventType.THINKING, content="test")
        assert event.guardrail_name is None


class TestEventType:
    """Test EventType enum."""

    def test_values(self):
        assert EventType.THINKING == "thinking"
        assert EventType.TOOL_CALL == "tool_call"
        assert EventType.TOOL_RESULT == "tool_result"
        assert EventType.HANDOFF == "handoff"
        assert EventType.WAITING == "waiting"
        assert EventType.DONE == "done"
        assert EventType.GUARDRAIL_PASS == "guardrail_pass"
        assert EventType.GUARDRAIL_FAIL == "guardrail_fail"


class TestAgentHandleRespond:
    """Test AgentHandle.respond() delegates to runtime."""

    def test_respond_delegates(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.respond({"approved": True})
        runtime.respond.assert_called_once_with("wf-1", {"approved": True})

    def test_approve_uses_respond(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.approve()
        runtime.respond.assert_called_once_with("wf-1", {"approved": True})

    def test_reject_uses_respond(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.reject("bad idea")
        runtime.respond.assert_called_once_with("wf-1", {"approved": False, "reason": "bad idea"})

    def test_send_uses_respond(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.send("hello")
        runtime.respond.assert_called_once_with("wf-1", {"message": "hello"})


class TestAgentHandleDelegation:
    """Test AgentHandle methods that delegate to runtime."""

    def test_get_status(self):
        runtime = MagicMock()
        runtime.get_status.return_value = AgentStatus(is_running=True)
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        status = handle.get_status()
        runtime.get_status.assert_called_once_with("wf-1")
        assert status.is_running is True

    def test_pause(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.pause()
        runtime.pause.assert_called_once_with("wf-1")

    def test_resume(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.resume()
        runtime.resume.assert_called_once_with("wf-1")

    def test_cancel(self):
        runtime = MagicMock()
        handle = AgentHandle(workflow_id="wf-1", runtime=runtime)
        handle.cancel("too slow")
        runtime.cancel.assert_called_once_with("wf-1", "too slow")

    def test_repr(self):
        handle = AgentHandle(workflow_id="wf-abc", runtime=MagicMock())
        r = repr(handle)
        assert "AgentHandle" in r
        assert "wf-abc" in r


class TestAgentResultPrintResult:
    """Test AgentResult.print_result()."""

    def test_print_basic(self, capsys):
        result = AgentResult(output="Hello!", workflow_id="wf-1")
        result.print_result()
        captured = capsys.readouterr()
        assert "Hello!" in captured.out
        assert "Agent Output" in captured.out
        assert "wf-1" in captured.out

    def test_print_dict_output(self, capsys):
        result = AgentResult(output={"summary": "All good", "score": 95})
        result.print_result()
        captured = capsys.readouterr()
        assert "summary" in captured.out
        assert "All good" in captured.out
        assert "score" in captured.out

    def test_print_with_tool_calls(self, capsys):
        result = AgentResult(
            output="Done",
            tool_calls=[{"name": "search"}, {"name": "calc"}],
        )
        result.print_result()
        captured = capsys.readouterr()
        assert "Tool calls: 2" in captured.out

    def test_print_with_token_usage(self, capsys):
        result = AgentResult(
            output="Done",
            token_usage=TokenUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
        )
        result.print_result()
        captured = capsys.readouterr()
        assert "150 total" in captured.out
        assert "100 prompt" in captured.out
        assert "50 completion" in captured.out

    def test_print_failed_result_shows_error(self, capsys):
        result = AgentResult(
            output=None,
            status=Status.FAILED,
            finish_reason=FinishReason.ERROR,
            error="API key not configured",
        )
        result.print_result()
        captured = capsys.readouterr()
        assert "ERROR: API key not configured" in captured.out


class TestStatusEnum:
    """Test Status enum backward compatibility and values."""

    def test_string_equality(self):
        assert Status.COMPLETED == "COMPLETED"
        assert Status.FAILED == "FAILED"
        assert Status.TERMINATED == "TERMINATED"
        assert Status.TIMED_OUT == "TIMED_OUT"

    def test_is_string_instance(self):
        assert isinstance(Status.COMPLETED, str)

    def test_in_string_check(self):
        assert Status.FAILED in ("FAILED", "TERMINATED")

    def test_all_values(self):
        assert len(Status) == 4


class TestFinishReasonEnum:
    """Test FinishReason enum backward compatibility and values."""

    def test_string_equality(self):
        assert FinishReason.STOP == "stop"
        assert FinishReason.LENGTH == "LENGTH"
        assert FinishReason.ERROR == "error"
        assert FinishReason.CANCELLED == "cancelled"
        assert FinishReason.TIMEOUT == "timeout"
        assert FinishReason.GUARDRAIL == "guardrail"
        assert FinishReason.TOOL_CALLS == "tool_calls"

    def test_is_string_instance(self):
        assert isinstance(FinishReason.STOP, str)

    def test_all_values(self):
        assert len(FinishReason) == 7


class TestAgentResultProperties:
    """Test is_success / is_failed convenience properties."""

    def test_is_success_on_completed(self):
        result = AgentResult(status=Status.COMPLETED)
        assert result.is_success is True
        assert result.is_failed is False

    def test_is_failed_on_failed(self):
        result = AgentResult(status=Status.FAILED)
        assert result.is_success is False
        assert result.is_failed is True

    def test_is_failed_on_terminated(self):
        result = AgentResult(status=Status.TERMINATED)
        assert result.is_failed is True

    def test_is_failed_on_timed_out(self):
        result = AgentResult(status=Status.TIMED_OUT)
        assert result.is_failed is True

    def test_backward_compat_status_string(self):
        result = AgentResult(status="COMPLETED")
        assert result.status == "COMPLETED"
        assert result.status == Status.COMPLETED


class TestBuildResultFromEvents:
    """Test that _build_result_from_events sets finish_reason and error."""

    def test_done_event_sets_stop(self):
        handle = AgentHandle(workflow_id="wf-1", runtime=MagicMock())
        events = [AgentEvent(type=EventType.DONE, output="Hello")]
        result = _build_result_from_events(events, handle)
        assert result.status == Status.COMPLETED
        assert result.finish_reason == FinishReason.STOP
        assert result.error is None
        assert result.output == "Hello"

    def test_error_event_sets_failed(self):
        handle = AgentHandle(workflow_id="wf-1", runtime=MagicMock())
        events = [AgentEvent(type=EventType.ERROR, content="401 Unauthorized")]
        result = _build_result_from_events(events, handle)
        assert result.status == Status.FAILED
        assert result.finish_reason == FinishReason.ERROR
        assert result.error == "401 Unauthorized"

    def test_guardrail_fail_event(self):
        handle = AgentHandle(workflow_id="wf-1", runtime=MagicMock())
        events = [
            AgentEvent(type=EventType.GUARDRAIL_FAIL, content="PII detected"),
        ]
        result = _build_result_from_events(events, handle)
        assert result.status == Status.FAILED
        assert result.finish_reason == FinishReason.GUARDRAIL
        assert result.error == "PII detected"
