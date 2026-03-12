# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Tests for AgentConfigSerializer."""
import pytest
from unittest.mock import MagicMock, patch

from agentspan.agents.config_serializer import AgentConfigSerializer


class TestAgentConfigSerializer:
    """Test serialization of Agent -> AgentConfig JSON."""

    def setup_method(self):
        self.serializer = AgentConfigSerializer()

    def test_serialize_simple_agent(self):
        """Simple agent with string instructions."""
        from agentspan.agents.agent import Agent
        agent = Agent(name="test", model="openai/gpt-4o", instructions="Be helpful.")

        config = self.serializer.serialize(agent)

        assert config["name"] == "test"
        assert config["model"] == "openai/gpt-4o"
        assert config["instructions"] == "Be helpful."
        assert config["maxTurns"] == 25

    def test_serialize_callable_instructions(self):
        """Callable instructions are resolved to strings."""
        from agentspan.agents.agent import Agent
        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            instructions=lambda: "Dynamic instructions",
        )

        config = self.serializer.serialize(agent)
        assert config["instructions"] == "Dynamic instructions"

    def test_serialize_prompt_template(self):
        """PromptTemplate instructions serialize as structured ref."""
        from agentspan.agents.agent import Agent, PromptTemplate
        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            instructions=PromptTemplate(name="my_template", variables={"role": "assistant"}, version=1),
        )

        config = self.serializer.serialize(agent)
        assert config["instructions"]["type"] == "prompt_template"
        assert config["instructions"]["name"] == "my_template"
        assert config["instructions"]["variables"] == {"role": "assistant"}
        assert config["instructions"]["version"] == 1

    def test_serialize_tools_worker(self):
        """Worker tools serialize with schema."""
        from agentspan.agents.agent import Agent
        from agentspan.agents.tool import tool

        @tool
        def search(query: str) -> str:
            """Search the web"""
            return f"Results for {query}"

        agent = Agent(name="test", model="openai/gpt-4o", tools=[search])
        config = self.serializer.serialize(agent)

        assert "tools" in config
        assert len(config["tools"]) == 1
        assert config["tools"][0]["name"] == "search"
        assert config["tools"][0]["toolType"] == "worker"
        assert "inputSchema" in config["tools"][0]

    def test_serialize_guardrails_regex(self):
        """RegexGuardrail serializes with patterns and mode."""
        from agentspan.agents.agent import Agent
        from agentspan.agents.guardrail import RegexGuardrail

        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            guardrails=[
                RegexGuardrail(
                    patterns=[r"\d{3}-\d{2}-\d{4}"],
                    mode="block",
                    name="no_ssn",
                    on_fail="retry",
                )
            ],
        )
        config = self.serializer.serialize(agent)

        assert len(config["guardrails"]) == 1
        g = config["guardrails"][0]
        assert g["guardrailType"] == "regex"
        assert g["name"] == "no_ssn"
        assert g["patterns"] == [r"\d{3}-\d{2}-\d{4}"]
        assert g["mode"] == "block"
        assert g["onFail"] == "retry"

    def test_serialize_guardrails_llm(self):
        """LLMGuardrail serializes with model and policy."""
        from agentspan.agents.agent import Agent
        from agentspan.agents.guardrail import LLMGuardrail

        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            guardrails=[
                LLMGuardrail(
                    model="openai/gpt-4o",
                    policy="No harmful content",
                    name="safety",
                )
            ],
        )
        config = self.serializer.serialize(agent)

        g = config["guardrails"][0]
        assert g["guardrailType"] == "llm"
        assert g["model"] == "openai/gpt-4o"
        assert g["policy"] == "No harmful content"

    def test_serialize_termination_text_mention(self):
        """TextMentionTermination serializes correctly."""
        from agentspan.agents.agent import Agent
        from agentspan.agents.termination import TextMentionTermination

        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            tools=[],  # Need tools for termination to matter
            termination=TextMentionTermination(text="DONE", case_sensitive=False),
        )
        config = self.serializer.serialize(agent)

        assert config["termination"]["type"] == "text_mention"
        assert config["termination"]["text"] == "DONE"
        assert config["termination"]["caseSensitive"] is False

    def test_serialize_termination_composite(self):
        """AND/OR composite termination conditions serialize recursively."""
        from agentspan.agents.agent import Agent
        from agentspan.agents.termination import (
            MaxMessageTermination,
            TextMentionTermination,
        )

        term = TextMentionTermination(text="DONE") & MaxMessageTermination(max_messages=10)
        agent = Agent(name="test", model="openai/gpt-4o", termination=term)
        config = self.serializer.serialize(agent)

        assert config["termination"]["type"] == "and"
        assert len(config["termination"]["conditions"]) == 2

    def test_serialize_sub_agents(self):
        """Sub-agents serialize recursively."""
        from agentspan.agents.agent import Agent

        sub1 = Agent(name="writer", model="openai/gpt-4o", instructions="Write.")
        sub2 = Agent(name="reviewer", model="openai/gpt-4o", instructions="Review.")
        agent = Agent(
            name="team",
            model="openai/gpt-4o",
            instructions="Coordinate.",
            agents=[sub1, sub2],
            strategy="handoff",
        )
        config = self.serializer.serialize(agent)

        assert len(config["agents"]) == 2
        assert config["agents"][0]["name"] == "writer"
        assert config["agents"][1]["name"] == "reviewer"
        assert config["strategy"] == "handoff"

    def test_serialize_stop_when(self):
        """stop_when callable serializes as WorkerRef."""
        from agentspan.agents.agent import Agent

        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            stop_when=lambda ctx: ctx["iteration"] > 5,
        )
        config = self.serializer.serialize(agent)

        assert config["stopWhen"]["taskName"] == "test_stop_when"

    def test_serialize_external_agent(self):
        """External agent serializes with external=True."""
        from agentspan.agents.agent import Agent

        agent = Agent(name="ext_agent")
        config = self.serializer.serialize(agent)

        assert config["external"] is True

    def test_serialize_memory(self):
        """Memory with messages serializes."""
        from agentspan.agents.agent import Agent

        memory = MagicMock()
        memory.messages = [{"role": "system", "message": "context"}]
        memory.max_messages = None

        agent = Agent(name="test", model="openai/gpt-4o", memory=memory)
        config = self.serializer.serialize(agent)

        assert config["memory"]["messages"] == [{"role": "system", "message": "context"}]

    def test_none_values_omitted(self):
        """None values are not included in the output."""
        from agentspan.agents.agent import Agent

        agent = Agent(name="test", model="openai/gpt-4o")
        config = self.serializer.serialize(agent)

        assert "tools" not in config
        assert "guardrails" not in config
        assert "termination" not in config
        assert "handoffs" not in config
