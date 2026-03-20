# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""User-facing create_agent wrapper for LangChain/LangGraph agents.

Import from here instead of langchain.agents so that Agentspan can
extract the LLM model, tools, and instructions for proper server-side
orchestration (AI_MODEL + SIMPLE tasks — same as OpenAI/ADK).

Sub-agents (another create_agent() graph passed in tools=) are automatically
detected and compiled as Conductor SUB_WORKFLOW tasks — not flat SIMPLE tasks.

Usage::

    from agentspan.agents.langchain import create_agent
    from langchain_openai import ChatOpenAI
    from langchain_core.tools import tool

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Regular tool
    @tool
    def my_tool(x: str) -> str:
        \"\"\"Does something.\"\"\"
        return x

    # Sub-agent (becomes a SUB_WORKFLOW)
    specialist = create_agent(llm, name="specialist", system_prompt="You are a specialist.")

    graph = create_agent(llm, tools=[my_tool, specialist], name="my_agent")

    with AgentRuntime() as runtime:
        result = runtime.run(graph, "prompt")
"""

from __future__ import annotations

from typing import Any, List, Optional, Union


def create_agent(
    model: Any,
    *,
    tools: Optional[List[Any]] = None,
    name: Optional[str] = None,
    system_prompt: Optional[Union[str, Any]] = None,
    **kwargs: Any,
) -> Any:
    """Agentspan wrapper around ``langchain.agents.create_agent``.

    Captures the LLM, tools, and instructions *before* compilation so that
    Agentspan can translate the agent into a proper server-side workflow
    (AI_MODEL task for the LLM + SIMPLE tasks for each tool), matching the
    OpenAI/ADK integration pattern.

    When a tool in *tools* is itself a ``CompiledStateGraph`` produced by
    ``create_agent()``, it is automatically wrapped as an agent tool and
    compiled as a Conductor ``SUB_WORKFLOW`` task — never as a flat SIMPLE task.

    Args:
        model: A LangChain chat model (e.g. ``ChatOpenAI``) or model string.
        tools: List of ``@tool``-decorated callables, ``StructuredTool`` instances,
            or other ``create_agent()`` graphs (sub-agents).
        name: Agent name registered with Conductor.
        system_prompt: System prompt string or a LangChain ``SystemMessage``
            used as the agent's instructions.
        **kwargs: Forwarded to ``langchain.agents.create_agent``.

    Returns:
        A ``CompiledStateGraph`` with ``._agentspan_meta`` attached for
        proper Agentspan serialization.
    """
    from langchain.agents import create_agent as _lc_create_agent  # type: ignore[import]

    # Resolve tools: wrap sub-agent graphs as LangChain-compatible tool objects
    resolved_tools: List[Any] = []
    for t in tools or []:
        if hasattr(t, "_agentspan_meta"):
            resolved_tools.append(_wrap_sub_agent(t))
        else:
            resolved_tools.append(t)

    graph = _lc_create_agent(
        model,
        tools=resolved_tools,
        name=name,
        system_prompt=system_prompt,
        **kwargs,
    )

    # Attach metadata — serializer uses this for full extraction
    instructions: Optional[str] = None
    if isinstance(system_prompt, str):
        instructions = system_prompt
    elif system_prompt is not None:
        # SystemMessage / BaseMessage
        try:
            instructions = str(system_prompt.content)
        except AttributeError:
            pass

    graph._agentspan_meta = {
        "llm": model,
        "tools": resolved_tools,  # already-wrapped list (sub-agents carry ._agentspan_sub_graph)
        "instructions": instructions,
    }

    return graph


def _wrap_sub_agent(sub_graph: Any) -> Any:
    """Wrap a ``create_agent()`` graph as a LangChain ``@tool`` for native execution.

    The returned tool:
    - Can be called natively (invokes the graph via ``graph.invoke()``)
    - Carries ``._agentspan_sub_graph`` so the serializer recognises it as an
      agent and compiles it as a Conductor ``SUB_WORKFLOW`` task.
    """
    from langchain_core.tools import tool as lc_tool

    sub_name = (getattr(sub_graph, "name", None) or "sub_agent").replace("-", "_").replace(" ", "_")
    description = f"Call the {sub_name} agent with a request and return its response."

    def _invoke(request: str) -> str:
        """Call this agent."""
        from langchain_core.messages import AIMessage, HumanMessage

        result = sub_graph.invoke({"messages": [HumanMessage(content=request)]})
        messages = result.get("messages", [])
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
                return msg.content if isinstance(msg.content, str) else str(msg.content)
        return ""

    _invoke.__name__ = sub_name
    _invoke.__doc__ = description

    wrapped = lc_tool(_invoke)
    # Tag so the serializer knows to compile as SUB_WORKFLOW
    wrapped._agentspan_sub_graph = sub_graph
    return wrapped
