"""Native OpenAI execution — run agents via their SDK, bypassing Conductor."""

from __future__ import annotations

import copy
import logging
from typing import Any

from agentspan.agents.result import (
    AgentEvent,
    AgentResult,
    FinishReason,
    Status,
    TokenUsage,
)

logger = logging.getLogger("validation.native.openai_runner")


# ── OpenAI native runner ────────────────────────────────────────────────


def run_openai_native(agent_obj: Any, prompt: str) -> AgentResult:
    """Run an OpenAI agent natively via ``agents.Runner.run_sync()``."""
    from agents import RunConfig, Runner
    from agents.exceptions import (
        InputGuardrailTripwireTriggered,
        MaxTurnsExceeded,
        OutputGuardrailTripwireTriggered,
    )

    prepared = _strip_model_prefix(agent_obj)
    logger.info(
        "Native sync: agents.Runner.run_sync(agent=%s, model=%s, prompt=%.80s...)",
        getattr(prepared, "name", "?"),
        getattr(prepared, "model", "?"),
        prompt,
    )

    try:
        run_result = Runner.run_sync(
            prepared,
            input=prompt,
            run_config=RunConfig(tracing_disabled=True),
        )
    except InputGuardrailTripwireTriggered as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.GUARDRAIL,
            error=str(e),
        )
    except OutputGuardrailTripwireTriggered as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.GUARDRAIL,
            error=str(e),
        )
    except MaxTurnsExceeded as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.ERROR,
            error=str(e),
        )
    except Exception as e:
        logger.error("Native sync failed: %s", e)
        return AgentResult(
            output=None,
            status=Status.FAILED,
            finish_reason=FinishReason.ERROR,
            error=str(e),
        )

    result = _map_run_result(run_result)
    logger.info(
        "Native sync completed: status=%s, tokens=%s, tool_calls=%d",
        result.status,
        result.token_usage.total_tokens if result.token_usage else 0,
        len(result.tool_calls),
    )
    return result


async def run_openai_native_async(agent_obj: Any, prompt: str) -> AgentResult:
    """Run an OpenAI agent natively via ``agents.Runner.run()`` (async)."""
    from agents import RunConfig, Runner
    from agents.exceptions import (
        InputGuardrailTripwireTriggered,
        MaxTurnsExceeded,
        OutputGuardrailTripwireTriggered,
    )

    prepared = _strip_model_prefix(agent_obj)
    logger.info(
        "Native async: agents.Runner.run(agent=%s, model=%s, prompt=%.80s...)",
        getattr(prepared, "name", "?"),
        getattr(prepared, "model", "?"),
        prompt,
    )

    try:
        run_result = await Runner.run(
            prepared,
            input=prompt,
            run_config=RunConfig(tracing_disabled=True),
        )
    except InputGuardrailTripwireTriggered as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.GUARDRAIL,
            error=str(e),
        )
    except OutputGuardrailTripwireTriggered as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.GUARDRAIL,
            error=str(e),
        )
    except MaxTurnsExceeded as e:
        return AgentResult(
            output=str(e),
            status=Status.FAILED,
            finish_reason=FinishReason.ERROR,
            error=str(e),
        )
    except Exception as e:
        logger.error("Native async failed: %s", e)
        return AgentResult(
            output=None,
            status=Status.FAILED,
            finish_reason=FinishReason.ERROR,
            error=str(e),
        )

    result = _map_run_result(run_result)
    logger.info(
        "Native async completed: status=%s, tokens=%s, tool_calls=%d",
        result.status,
        result.token_usage.total_tokens if result.token_usage else 0,
        len(result.tool_calls),
    )
    return result


def run_openai_native_stream(agent_obj: Any, prompt: str):
    """Run an OpenAI agent natively and yield AgentEvent objects.

    Uses ``Runner.run_sync()`` under the hood (no real-time streaming), then
    reconstructs events from the run result so the example's event loop works.
    """
    from agents import RunConfig, Runner
    from agents.items import MessageOutputItem, ToolCallItem, ToolCallOutputItem

    prepared = _strip_model_prefix(agent_obj)
    try:
        run_result = Runner.run_sync(
            prepared,
            input=prompt,
            run_config=RunConfig(tracing_disabled=True),
        )
    except Exception as e:
        yield AgentEvent(type=EventType.ERROR, content=str(e))
        return

    # Emit thinking / tool_call / tool_result events reconstructed from items.
    # Use string values (not EventType enum) so f-strings render as "tool_call"
    # rather than "EventType.TOOL_CALL" (Python 3.12 changed str-Enum formatting).
    pending_call: dict | None = None
    for item in run_result.new_items:
        if isinstance(item, MessageOutputItem):
            text = ""
            for part in getattr(item.raw_item, "content", []):
                if hasattr(part, "text"):
                    text += part.text
            if text:
                yield AgentEvent(type="thinking", content=text)
        elif isinstance(item, ToolCallItem):
            raw = item.raw_item
            pending_call = {"name": getattr(raw, "name", ""), "args": getattr(raw, "arguments", "")}
            yield AgentEvent(type="tool_call", tool_name=pending_call["name"])
        elif isinstance(item, ToolCallOutputItem):
            name = pending_call["name"] if pending_call else ""
            yield AgentEvent(type="tool_result", tool_name=name, result=item.output)
            pending_call = None

    yield AgentEvent(type="done", output=run_result.final_output)


# ── Helpers ─────────────────────────────────────────────────────────────


def _strip_model_prefix(agent_obj: Any) -> Any:
    """Clone an OpenAI Agent, stripping 'provider/' prefix from model names.

    Recurses into handoffs and agent-as-tool wrappers.
    OpenAI Agent is a dataclass — ``copy.copy()`` + attribute mutation works.
    """
    from agents import Agent as OAIAgent

    if not isinstance(agent_obj, OAIAgent):
        return agent_obj

    cloned = copy.copy(agent_obj)

    # Strip provider prefix from model
    if isinstance(cloned.model, str) and "/" in cloned.model:
        cloned.model = cloned.model.split("/", 1)[1]

    # Recurse into handoffs
    if cloned.handoffs:
        cloned.handoffs = [_strip_model_prefix(h) for h in cloned.handoffs]

    # Recurse into tools (agent-as-tool wraps an agent)
    if cloned.tools:
        new_tools = []
        for t in cloned.tools:
            inner = getattr(t, "agent", None)
            if isinstance(inner, OAIAgent):
                stripped = _strip_model_prefix(inner)
                new_tools.append(
                    stripped.as_tool(
                        tool_name=getattr(t, "tool_name", getattr(t, "name", "")),
                        tool_description=getattr(
                            t, "tool_description", getattr(t, "description", "")
                        ),
                    )
                )
            else:
                new_tools.append(t)
        cloned.tools = new_tools

    return cloned


def _map_run_result(run_result: Any) -> AgentResult:
    """Convert an OpenAI ``RunResult`` to :class:`AgentResult`."""
    from agents.items import (
        MessageOutputItem,
        ToolCallItem,
        ToolCallOutputItem,
    )

    output = run_result.final_output

    # Extract tool calls
    tool_calls = []
    pending = None
    for item in run_result.new_items:
        if isinstance(item, ToolCallItem):
            raw = item.raw_item
            pending = {
                "name": getattr(raw, "name", str(item)),
                "args": getattr(raw, "arguments", ""),
            }
        elif isinstance(item, ToolCallOutputItem):
            if pending is not None:
                pending["result"] = item.output
                tool_calls.append(pending)
                pending = None

    # Extract messages
    messages = []
    for item in run_result.new_items:
        if isinstance(item, MessageOutputItem):
            text = ""
            raw = item.raw_item
            if hasattr(raw, "content"):
                for part in raw.content:
                    if hasattr(part, "text"):
                        text += part.text
            messages.append({"role": "assistant", "content": text})

    # Aggregate token usage from raw_responses
    prompt_tokens = 0
    completion_tokens = 0
    for resp in run_result.raw_responses:
        usage = getattr(resp, "usage", None)
        if usage:
            prompt_tokens += getattr(usage, "input_tokens", 0)
            completion_tokens += getattr(usage, "output_tokens", 0)

    token_usage = (
        TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )
        if (prompt_tokens or completion_tokens)
        else None
    )

    return AgentResult(
        output=output,
        messages=messages,
        tool_calls=tool_calls,
        status=Status.COMPLETED,
        finish_reason=FinishReason.STOP,
        token_usage=token_usage,
    )
