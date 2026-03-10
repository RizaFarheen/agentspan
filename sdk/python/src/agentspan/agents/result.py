"""Result types — AgentResult, AgentHandle, AgentEvent, AgentStatus, AgentStream, AsyncAgentStream.

These classes provide the interface between the user and a running or
completed Conductor workflow that backs an agent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator, Callable, Dict, Iterator, List, Optional


# ── TokenUsage ──────────────────────────────────────────────────────────


@dataclass
class TokenUsage:
    """Aggregated token usage across all LLM calls in an agent execution.

    Attributes:
        prompt_tokens: Total input/prompt tokens consumed.
        completion_tokens: Total output/completion tokens generated.
        total_tokens: Sum of prompt + completion tokens.
    """

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


# ── AgentResult (returned by run()) ─────────────────────────────────────


@dataclass
class AgentResult:
    """The result of a completed agent execution.

    Attributes:
        output: The agent's final answer.  If ``output_type`` was set on the
            agent, this is a validated instance of that type.
        workflow_id: The Conductor workflow ID (for debugging in the UI).
        messages: Full conversation history (list of message dicts).
        tool_calls: All tool invocations with inputs and outputs.
        status: Terminal status string (``"COMPLETED"``, ``"FAILED"``, etc.).
        token_usage: Aggregated token usage across all LLM calls.
        metadata: Extra data from the workflow execution.
    """

    output: Any = None
    workflow_id: str = ""
    correlation_id: Optional[str] = None
    messages: List[Dict[str, Any]] = field(default_factory=list)
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "COMPLETED"
    token_usage: Optional[TokenUsage] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    finish_reason: Optional[str] = None
    events: List["AgentEvent"] = field(default_factory=list)

    def print_result(self) -> None:
        """Pretty-print the agent output with clear visual separators."""
        width = 50
        print(f"\n╒{'═' * width}╕")
        print(f"│ {'Agent Output':<{width - 1}}│")
        print(f"╘{'═' * width}╛")
        print()

        if isinstance(self.output, dict):
            for key, value in self.output.items():
                print(f"--- {key} ---")
                print(value)
                print()
        else:
            print(self.output)
            print()

        if self.tool_calls:
            print(f"Tool calls: {len(self.tool_calls)}")
        if self.token_usage:
            print(
                f"Tokens: {self.token_usage.total_tokens} total "
                f"({self.token_usage.prompt_tokens} prompt, "
                f"{self.token_usage.completion_tokens} completion)"
            )
        if self.finish_reason:
            print(f"Finish reason: {self.finish_reason}")
        if self.workflow_id:
            print(f"Workflow ID: {self.workflow_id}")

        print(f"\n")

# ── AgentStatus (returned by handle.get_status()) ──────────────────────


@dataclass
class AgentStatus:
    """Snapshot of a running agent's status.

    Attributes:
        workflow_id: The Conductor workflow ID.
        is_complete: ``True`` if the workflow has reached a terminal state.
        is_running: ``True`` if the workflow is still executing.
        is_waiting: ``True`` if the workflow is paused (e.g. human-in-the-loop).
        output: Available when ``is_complete`` is ``True``.
        status: Raw Conductor workflow status string.
        current_task: Reference name of the currently executing task.
        messages: Conversation messages accumulated so far.
    """

    workflow_id: str = ""
    is_complete: bool = False
    is_running: bool = False
    is_waiting: bool = False
    output: Any = None
    status: str = ""
    current_task: Optional[str] = None
    messages: List[Dict[str, Any]] = field(default_factory=list)
    pending_tool: Optional[Dict[str, Any]] = None


# ── AgentHandle (returned by start()) ──────────────────────────────────


class AgentHandle:
    """A handle to a running agent workflow.

    Returned by :func:`start`.  Allows checking status, interacting with
    human-in-the-loop pauses, and controlling execution — from any process,
    even after restarts.

    Args:
        workflow_id: The Conductor workflow ID.
        runtime: The :class:`AgentRuntime` that launched this workflow.
    """

    def __init__(self, workflow_id: str, runtime: Any, correlation_id: Optional[str] = None) -> None:
        self.workflow_id = workflow_id
        self.correlation_id = correlation_id
        self._runtime = runtime

    # ── Status ──────────────────────────────────────────────────────

    def get_status(self) -> AgentStatus:
        """Fetch the current status of the agent workflow."""
        return self._runtime.get_status(self.workflow_id)

    # ── Human-in-the-loop ───────────────────────────────────────────

    def respond(self, output: dict) -> None:
        """Complete a pending human task with arbitrary output."""
        self._runtime.respond(self.workflow_id, output)

    def approve(self) -> None:
        """Approve a pending tool call that requires human approval."""
        self.respond({"approved": True})

    def reject(self, reason: str = "") -> None:
        """Reject a pending tool call with an optional reason."""
        self.respond({"approved": False, "reason": reason})

    def send(self, message: str) -> None:
        """Send a message to a waiting agent (multi-turn conversation)."""
        self.respond({"message": message})

    # ── Execution control ───────────────────────────────────────────

    def pause(self) -> None:
        """Pause the agent workflow."""
        self._runtime.pause(self.workflow_id)

    def resume(self) -> None:
        """Resume a paused agent workflow."""
        self._runtime.resume(self.workflow_id)

    def cancel(self, reason: str = "") -> None:
        """Cancel the agent workflow."""
        self._runtime.cancel(self.workflow_id, reason)

    # ── Streaming ────────────────────────────────────────────────────

    def stream(self) -> "AgentStream":
        """Stream events for this workflow's execution.

        Connects to the server's SSE endpoint and yields events as they
        arrive.  Falls back to polling if SSE is unavailable.

        Returns:
            An :class:`AgentStream` that yields events and provides
            HITL controls and access to the final result.
        """
        event_iter = self._runtime._stream_workflow(self.workflow_id)
        return AgentStream(handle=self, event_iterator=event_iter)

    # ── Async methods ────────────────────────────────────────────────

    async def get_status_async(self) -> AgentStatus:
        """Async version of :meth:`get_status`."""
        return await self._runtime.get_status_async(self.workflow_id)

    async def respond_async(self, output: dict) -> None:
        """Async version of :meth:`respond`."""
        await self._runtime.respond_async(self.workflow_id, output)

    async def approve_async(self) -> None:
        """Async version of :meth:`approve`."""
        await self.respond_async({"approved": True})

    async def reject_async(self, reason: str = "") -> None:
        """Async version of :meth:`reject`."""
        await self.respond_async({"approved": False, "reason": reason})

    async def send_async(self, message: str) -> None:
        """Async version of :meth:`send`."""
        await self.respond_async({"message": message})

    async def pause_async(self) -> None:
        """Async version of :meth:`pause`."""
        await self._runtime.pause_async(self.workflow_id)

    async def resume_async(self) -> None:
        """Async version of :meth:`resume`."""
        await self._runtime.resume_async(self.workflow_id)

    async def cancel_async(self, reason: str = "") -> None:
        """Async version of :meth:`cancel`."""
        await self._runtime.cancel_async(self.workflow_id, reason)

    def stream_async(self) -> "AsyncAgentStream":
        """Async streaming view. Returns an :class:`AsyncAgentStream`."""
        return AsyncAgentStream(handle=self, runtime=self._runtime)

    def __repr__(self) -> str:
        return f"AgentHandle(workflow_id={self.workflow_id!r})"


# ── AgentEvent (yielded by stream()) ───────────────────────────────────


class EventType(str, Enum):
    """Types of events emitted during agent execution."""

    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    HANDOFF = "handoff"
    WAITING = "waiting"
    MESSAGE = "message"
    ERROR = "error"
    DONE = "done"
    GUARDRAIL_PASS = "guardrail_pass"
    GUARDRAIL_FAIL = "guardrail_fail"


@dataclass
class AgentEvent:
    """A single event from a streaming agent execution.

    Attributes:
        type: The event type (see :class:`EventType`).
        content: Text content (for ``thinking``, ``message``, ``error``,
            ``guardrail_pass``, ``guardrail_fail``).
        tool_name: Tool name (for ``tool_call``, ``tool_result``).
        args: Tool call arguments (for ``tool_call``).
        result: Tool result (for ``tool_result``).
        target: Target agent name (for ``handoff``).
        output: Final output (for ``done``).
        workflow_id: The Conductor workflow ID.
        guardrail_name: Guardrail name (for ``guardrail_pass``, ``guardrail_fail``).
    """

    type: str
    content: Optional[str] = None
    tool_name: Optional[str] = None
    args: Optional[Dict[str, Any]] = None
    result: Any = None
    target: Optional[str] = None
    output: Any = None
    workflow_id: str = ""
    guardrail_name: Optional[str] = None


# ── AgentStream (returned by stream()) ────────────────────────────────


class AgentStream:
    """A streaming view of an agent execution.

    Returned by :func:`stream` and :meth:`AgentHandle.stream`.  Iterable
    — yields :class:`AgentEvent` objects as they arrive.  After iteration,
    :attr:`result` contains a summary :class:`AgentResult` built from the
    captured events.

    Also exposes HITL convenience methods that delegate to the underlying
    :class:`AgentHandle`.

    Args:
        handle: The :class:`AgentHandle` for the workflow.
        event_iterator: An iterator yielding :class:`AgentEvent` objects.
    """

    def __init__(
        self,
        handle: AgentHandle,
        event_iterator: Iterator[AgentEvent],
    ) -> None:
        self.handle = handle
        self.events: List[AgentEvent] = []
        self.result: Optional[AgentResult] = None
        self._event_iterator = event_iterator
        self._exhausted = False

    def __iter__(self) -> Iterator[AgentEvent]:
        """Yield events, capturing them in :attr:`events`."""
        for event in self._event_iterator:
            self.events.append(event)
            yield event
        self._exhausted = True
        self._build_result()

    def get_result(self) -> AgentResult:
        """Drain the stream (if not already) and return the final result.

        If the stream has already been fully iterated, returns immediately.
        Otherwise consumes remaining events first.
        """
        if not self._exhausted:
            for event in self._event_iterator:
                self.events.append(event)
            self._exhausted = True
            self._build_result()
        if self.result is None:
            self._build_result()
        return self.result  # type: ignore[return-value]

    def _build_result(self) -> None:
        """Build an :class:`AgentResult` from captured events."""
        output = None
        status = "COMPLETED"
        tool_calls: List[Dict[str, Any]] = []
        pending_call: Optional[Dict[str, Any]] = None

        for ev in self.events:
            if ev.type == EventType.TOOL_CALL:
                pending_call = {"name": ev.tool_name, "args": ev.args}
            elif ev.type == EventType.TOOL_RESULT:
                if pending_call is not None:
                    pending_call["result"] = ev.result
                    tool_calls.append(pending_call)
                    pending_call = None
                else:
                    tool_calls.append(
                        {"name": ev.tool_name, "result": ev.result}
                    )
            elif ev.type == EventType.DONE:
                output = ev.output
            elif ev.type == EventType.ERROR:
                output = ev.content
                status = "FAILED"

        self.result = AgentResult(
            output=output,
            workflow_id=self.handle.workflow_id,
            correlation_id=self.handle.correlation_id,
            tool_calls=tool_calls,
            status=status,
            events=list(self.events),
        )

    # ── HITL convenience (delegates to handle) ────────────────────

    def respond(self, output: dict) -> None:
        """Complete a pending human task with arbitrary output."""
        self.handle.respond(output)

    def approve(self) -> None:
        """Approve a pending tool call that requires human approval."""
        self.handle.approve()

    def reject(self, reason: str = "") -> None:
        """Reject a pending tool call with an optional reason."""
        self.handle.reject(reason)

    def send(self, message: str) -> None:
        """Send a message to a waiting agent (multi-turn conversation)."""
        self.handle.send(message)

    @property
    def workflow_id(self) -> str:
        """The Conductor workflow ID."""
        return self.handle.workflow_id

    def __repr__(self) -> str:
        return (
            f"AgentStream(workflow_id={self.handle.workflow_id!r}, "
            f"events={len(self.events)}, exhausted={self._exhausted})"
        )


# ── Helper for building results from events ──────────────────────────


def _build_result_from_events(
    events: List[AgentEvent],
    handle: AgentHandle,
) -> AgentResult:
    """Build an :class:`AgentResult` from a list of captured events."""
    output = None
    status = "COMPLETED"
    tool_calls: List[Dict[str, Any]] = []
    pending_call: Optional[Dict[str, Any]] = None

    for ev in events:
        if ev.type == EventType.TOOL_CALL:
            pending_call = {"name": ev.tool_name, "args": ev.args}
        elif ev.type == EventType.TOOL_RESULT:
            if pending_call is not None:
                pending_call["result"] = ev.result
                tool_calls.append(pending_call)
                pending_call = None
            else:
                tool_calls.append(
                    {"name": ev.tool_name, "result": ev.result}
                )
        elif ev.type == EventType.DONE:
            output = ev.output
        elif ev.type == EventType.ERROR:
            output = ev.content
            status = "FAILED"

    return AgentResult(
        output=output,
        workflow_id=handle.workflow_id,
        correlation_id=handle.correlation_id,
        tool_calls=tool_calls,
        status=status,
        events=list(events),
    )


# ── AsyncAgentStream (async version of AgentStream) ─────────────────


class AsyncAgentStream:
    """Async streaming view of an agent execution.

    Returned by :func:`stream_async` and :meth:`AgentHandle.stream_async`.
    Async-iterable — yields :class:`AgentEvent` objects.  After iteration,
    :attr:`result` contains a summary :class:`AgentResult`.

    Example::

        stream = await stream_async(agent, "Hello")
        async for event in stream:
            print(event.type, event.content)
        print(stream.result.output)
    """

    def __init__(self, handle: AgentHandle, runtime: Any) -> None:
        self.handle = handle
        self.events: List[AgentEvent] = []
        self.result: Optional[AgentResult] = None
        self._runtime = runtime
        self._exhausted = False

    def __aiter__(self) -> AsyncIterator[AgentEvent]:
        return self._iterate()

    async def _iterate(self) -> AsyncIterator[AgentEvent]:
        async for event in self._runtime._stream_workflow_async(self.handle.workflow_id):
            self.events.append(event)
            yield event
        self._exhausted = True
        self.result = _build_result_from_events(self.events, self.handle)

    async def get_result(self) -> AgentResult:
        """Drain the stream (if not already) and return the final result."""
        if not self._exhausted:
            async for event in self._runtime._stream_workflow_async(self.handle.workflow_id):
                self.events.append(event)
            self._exhausted = True
            self.result = _build_result_from_events(self.events, self.handle)
        if self.result is None:
            self.result = _build_result_from_events(self.events, self.handle)
        return self.result

    # ── Async HITL convenience (delegates to handle) ─────────────

    async def respond(self, output: dict) -> None:
        """Complete a pending human task with arbitrary output."""
        await self.handle.respond_async(output)

    async def approve(self) -> None:
        """Approve a pending tool call that requires human approval."""
        await self.handle.approve_async()

    async def reject(self, reason: str = "") -> None:
        """Reject a pending tool call with an optional reason."""
        await self.handle.reject_async(reason)

    async def send(self, message: str) -> None:
        """Send a message to a waiting agent (multi-turn conversation)."""
        await self.handle.send_async(message)

    @property
    def workflow_id(self) -> str:
        """The Conductor workflow ID."""
        return self.handle.workflow_id

    def __repr__(self) -> str:
        return (
            f"AsyncAgentStream(workflow_id={self.handle.workflow_id!r}, "
            f"events={len(self.events)}, exhausted={self._exhausted})"
        )
