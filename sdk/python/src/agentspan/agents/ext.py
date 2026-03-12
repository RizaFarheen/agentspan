# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Extended agent types — specialised agent classes for common patterns.

- :class:`UserProxyAgent` — a human stand-in agent that pauses for real input.
- :class:`GPTAssistantAgent` — wraps the OpenAI Assistants API as an Agent.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Union

from agentspan.agents.agent import Agent

logger = logging.getLogger("agentspan.agents.ext")


# ── UserProxyAgent ──────────────────────────────────────────────────────


class UserProxyAgent(Agent):
    """An agent that acts as a stand-in for a human user.

    When it is this agent's turn in a multi-agent conversation, the
    workflow pauses with a ``HumanTask`` and waits for real human input.
    The human's response becomes the agent's output.

    In single-agent use, it behaves like a human-input gate — useful
    for building interactive conversational flows.

    Args:
        name: Agent name (default ``"user"``).
        human_input_mode: When to request human input:
            - ``"ALWAYS"`` — always pause for human input.
            - ``"TERMINATE"`` — pause only when the conversation would
              otherwise end (e.g. other agents say "TERMINATE").
            - ``"NEVER"`` — never pause (pass-through, useful for testing).
        default_response: Response to use when ``human_input_mode="NEVER"``
            (default ``"Continue."``).
        model: LLM model (only used if the agent needs to generate
            a response when no human is available).

    Example::

        from agentspan.agents.ext import UserProxyAgent

        user = UserProxyAgent(name="human")
        assistant = Agent(name="assistant", model="openai/gpt-4o")

        team = Agent(
            name="chat",
            model="openai/gpt-4o",
            agents=[user, assistant],
            strategy="round_robin",
            max_turns=6,
        )
    """

    def __init__(
        self,
        name: str = "user",
        human_input_mode: str = "ALWAYS",
        default_response: str = "Continue.",
        model: str = "openai/gpt-4o",
        instructions: Union[str, Callable[..., str]] = "",
        **kwargs: Any,
    ) -> None:
        if human_input_mode not in ("ALWAYS", "TERMINATE", "NEVER"):
            raise ValueError(
                f"Invalid human_input_mode {human_input_mode!r}. "
                "Must be 'ALWAYS', 'TERMINATE', or 'NEVER'"
            )

        self.human_input_mode = human_input_mode
        self.default_response = default_response

        # Mark this as a user proxy via metadata
        metadata = kwargs.pop("metadata", {}) or {}
        metadata["_agent_type"] = "user_proxy"
        metadata["_human_input_mode"] = human_input_mode
        metadata["_default_response"] = default_response

        if not instructions:
            instructions = (
                "You represent the human user in this conversation. "
                "Relay the human's input exactly as provided."
            )

        super().__init__(
            name=name,
            model=model,
            instructions=instructions,
            metadata=metadata,
            **kwargs,
        )

    def __repr__(self) -> str:
        return (
            f"UserProxyAgent(name={self.name!r}, "
            f"mode={self.human_input_mode!r})"
        )


# ── GPTAssistantAgent ──────────────────────────────────────────────────


class GPTAssistantAgent(Agent):
    """An agent backed by the OpenAI Assistants API.

    Wraps an OpenAI Assistant (with its own instructions, tools, and
    file search capabilities) as a Conductor Agent.  The assistant's
    execution is handled via the Assistants API Threads and Runs.

    Requires the ``openai`` package.

    Args:
        name: Agent name.
        assistant_id: Existing OpenAI Assistant ID. If ``None``, a new
            assistant is created using the provided instructions and model.
        model: OpenAI model (e.g. ``"gpt-4o"``). Only used when creating
            a new assistant.
        instructions: System instructions for the assistant.
        openai_tools: OpenAI-native tools config (e.g.
            ``[{"type": "code_interpreter"}]``).
        api_key: OpenAI API key. If ``None``, uses the ``OPENAI_API_KEY``
            environment variable.

    Example::

        from agentspan.agents.ext import GPTAssistantAgent

        # Use an existing assistant
        agent = GPTAssistantAgent(
            name="coder",
            assistant_id="asst_abc123",
        )

        # Or create one on the fly
        agent = GPTAssistantAgent(
            name="analyst",
            model="gpt-4o",
            instructions="You are a data analyst.",
            openai_tools=[{"type": "code_interpreter"}],
        )
    """

    def __init__(
        self,
        name: str,
        assistant_id: Optional[str] = None,
        model: str = "openai/gpt-4o",
        instructions: str = "",
        openai_tools: Optional[List[Dict[str, Any]]] = None,
        api_key: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        self.assistant_id = assistant_id
        self.openai_tools = openai_tools or []
        self._api_key = api_key

        # Mark via metadata
        metadata = kwargs.pop("metadata", {}) or {}
        metadata["_agent_type"] = "gpt_assistant"
        if assistant_id:
            metadata["_assistant_id"] = assistant_id

        # Build the tool that calls the Assistants API
        from agentspan.agents.tool import tool

        agent_ref = self

        @tool(name=f"{name}_assistant_call")
        def call_assistant(message: str) -> str:
            """Send a message to the OpenAI Assistant and get a response."""
            return agent_ref._run_assistant(message)

        tools = kwargs.pop("tools", []) or []
        tools.append(call_assistant)

        # Normalise the model string
        if "/" not in model:
            model = f"openai/{model}"

        super().__init__(
            name=name,
            model=model,
            instructions=instructions or "You are a helpful assistant.",
            tools=tools,
            metadata=metadata,
            max_turns=1,
            **kwargs,
        )

    def _run_assistant(self, message: str) -> str:
        """Execute a message against the OpenAI Assistants API."""
        try:
            import openai
        except ImportError:
            return (
                "Error: openai package not installed. "
                "Install with: pip install openai"
            )

        import os

        api_key = self._api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "Error: No OpenAI API key provided."

        client = openai.OpenAI(api_key=api_key)

        # Create assistant if needed
        assistant_id = self.assistant_id
        if not assistant_id:
            instructions = (
                self.instructions() if callable(self.instructions)
                else self.instructions
            )
            model_name = self.model.split("/", 1)[-1]
            assistant = client.beta.assistants.create(
                model=model_name,
                instructions=instructions,
                tools=self.openai_tools,
            )
            assistant_id = assistant.id
            self.assistant_id = assistant_id

        try:
            # Create thread and run
            thread = client.beta.threads.create()
            client.beta.threads.messages.create(
                thread_id=thread.id,
                role="user",
                content=message,
            )

            run = client.beta.threads.runs.create_and_poll(
                thread_id=thread.id,
                assistant_id=assistant_id,
            )

            if run.status == "completed":
                messages = client.beta.threads.messages.list(thread_id=thread.id)
                for msg in messages.data:
                    if msg.role == "assistant":
                        parts = []
                        for block in msg.content:
                            if hasattr(block, "text"):
                                parts.append(block.text.value)
                        if parts:
                            return "\n".join(parts)
                return "No response from assistant."
            else:
                return f"Assistant run ended with status: {run.status}"

        except Exception as e:
            return f"OpenAI Assistant error: {e}"

    def __repr__(self) -> str:
        return (
            f"GPTAssistantAgent(name={self.name!r}, "
            f"assistant_id={self.assistant_id!r})"
        )
