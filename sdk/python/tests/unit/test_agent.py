"""Unit tests for the Agent class."""

import pytest

from agentspan.agents.agent import Agent


class TestAgentCreation:
    """Test Agent construction and validation."""

    def test_basic_agent(self):
        agent = Agent(name="test", model="openai/gpt-4o")
        assert agent.name == "test"
        assert agent.model == "openai/gpt-4o"
        assert agent.strategy == "handoff"
        assert agent.max_turns == 25
        assert agent.tools == []
        assert agent.agents == []

    def test_agent_with_instructions(self):
        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            instructions="You are helpful.",
        )
        assert agent.instructions == "You are helpful."

    def test_agent_with_callable_instructions(self):
        def get_instructions():
            return "Dynamic instructions"

        agent = Agent(name="test", model="openai/gpt-4o", instructions=get_instructions)
        assert callable(agent.instructions)
        assert agent.instructions() == "Dynamic instructions"

    def test_agent_with_tools(self):
        from agentspan.agents.tool import tool

        @tool
        def my_tool(x: str) -> str:
            """A test tool."""
            return x

        agent = Agent(name="test", model="openai/gpt-4o", tools=[my_tool])
        assert len(agent.tools) == 1

    def test_agent_with_sub_agents(self):
        sub1 = Agent(name="sub1", model="openai/gpt-4o")
        sub2 = Agent(name="sub2", model="openai/gpt-4o")
        parent = Agent(
            name="parent",
            model="openai/gpt-4o",
            agents=[sub1, sub2],
            strategy="handoff",
        )
        assert len(parent.agents) == 2
        assert parent.strategy == "handoff"

    def test_round_robin_strategy_accepted(self):
        sub1 = Agent(name="a", model="openai/gpt-4o")
        sub2 = Agent(name="b", model="openai/gpt-4o")
        agent = Agent(
            name="debate", model="openai/gpt-4o",
            agents=[sub1, sub2], strategy="round_robin", max_turns=4,
        )
        assert agent.strategy == "round_robin"
        assert agent.max_turns == 4

    def test_invalid_strategy_raises(self):
        with pytest.raises(ValueError, match="Invalid strategy"):
            Agent(name="test", model="openai/gpt-4o", strategy="invalid")

    def test_router_requires_router_arg(self):
        sub = Agent(name="sub", model="openai/gpt-4o")
        with pytest.raises(ValueError, match="requires a router"):
            Agent(
                name="test",
                model="openai/gpt-4o",
                agents=[sub],
                strategy="router",
            )

    def test_agent_with_metadata(self):
        agent = Agent(
            name="test",
            model="openai/gpt-4o",
            metadata={"env": "prod", "version": "1.0"},
        )
        assert agent.metadata == {"env": "prod", "version": "1.0"}

    def test_random_strategy_accepted(self):
        sub1 = Agent(name="a", model="openai/gpt-4o")
        sub2 = Agent(name="b", model="openai/gpt-4o")
        agent = Agent(
            name="random_pick", model="openai/gpt-4o",
            agents=[sub1, sub2], strategy="random", max_turns=4,
        )
        assert agent.strategy == "random"
        assert agent.max_turns == 4

    def test_termination_param(self):
        from agentspan.agents.termination import TextMentionTermination

        cond = TextMentionTermination("DONE")
        agent = Agent(name="test", model="openai/gpt-4o", termination=cond)
        assert agent.termination is cond

    def test_allowed_transitions_param(self):
        sub1 = Agent(name="a", model="openai/gpt-4o")
        sub2 = Agent(name="b", model="openai/gpt-4o")
        transitions = {"a": ["b"], "b": ["a"]}
        agent = Agent(
            name="test", model="openai/gpt-4o",
            agents=[sub1, sub2], strategy="round_robin",
            allowed_transitions=transitions,
        )
        assert agent.allowed_transitions == transitions


class TestAgentChaining:
    """Test the >> operator for sequential pipelines."""

    def test_two_agents(self):
        a = Agent(name="a", model="openai/gpt-4o")
        b = Agent(name="b", model="openai/gpt-4o")
        pipeline = a >> b
        assert pipeline.strategy == "sequential"
        assert len(pipeline.agents) == 2
        assert pipeline.agents[0].name == "a"
        assert pipeline.agents[1].name == "b"

    def test_three_agents(self):
        a = Agent(name="a", model="openai/gpt-4o")
        b = Agent(name="b", model="openai/gpt-4o")
        c = Agent(name="c", model="openai/gpt-4o")
        pipeline = a >> b >> c
        assert pipeline.strategy == "sequential"
        assert len(pipeline.agents) == 3

    def test_pipeline_name(self):
        a = Agent(name="a", model="openai/gpt-4o")
        b = Agent(name="b", model="openai/gpt-4o")
        pipeline = a >> b
        assert pipeline.name == "a_b"


class TestAgentRepr:
    """Test Agent string representation."""

    def test_simple_repr(self):
        agent = Agent(name="test", model="openai/gpt-4o")
        assert "Agent(" in repr(agent)
        assert "test" in repr(agent)
        assert "openai/gpt-4o" in repr(agent)

    def test_repr_with_tools(self):
        from agentspan.agents.tool import tool

        @tool
        def t(x: str) -> str:
            """T."""
            return x

        agent = Agent(name="test", model="openai/gpt-4o", tools=[t])
        assert "tools=1" in repr(agent)

    def test_repr_with_agents(self):
        sub = Agent(name="sub", model="openai/gpt-4o")
        parent = Agent(name="parent", model="openai/gpt-4o", agents=[sub])
        assert "agents=1" in repr(parent)
        assert "handoff" in repr(parent)


# ── PromptTemplate ───────────────────────────────────────────────────


class TestPromptTemplate:
    """Test the PromptTemplate dataclass."""

    def test_basic_creation(self):
        from agentspan.agents.agent import PromptTemplate

        t = PromptTemplate("my-prompt")
        assert t.name == "my-prompt"
        assert t.variables == {}
        assert t.version is None

    def test_with_variables_and_version(self):
        from agentspan.agents.agent import PromptTemplate

        t = PromptTemplate("support-v2", variables={"company": "Acme"}, version=3)
        assert t.name == "support-v2"
        assert t.variables == {"company": "Acme"}
        assert t.version == 3

    def test_is_frozen(self):
        from agentspan.agents.agent import PromptTemplate

        t = PromptTemplate("test")
        with pytest.raises(AttributeError):
            t.name = "changed"

    def test_agent_accepts_prompt_template(self):
        from agentspan.agents.agent import PromptTemplate

        t = PromptTemplate("my-instructions", variables={"tone": "formal"})
        agent = Agent(name="test", model="openai/gpt-4o", instructions=t)
        assert isinstance(agent.instructions, PromptTemplate)
        assert agent.instructions.name == "my-instructions"

    def test_import_from_init(self):
        from agentspan.agents import PromptTemplate

        t = PromptTemplate("test")
        assert t.name == "test"


# ── P2-A / P2-B / P4-A: Agent validation edge cases ──────────────────


class TestAgentNameValidation:
    """Test Agent name validation."""

    def test_empty_name_raises(self):
        with pytest.raises(ValueError, match="non-empty string"):
            Agent(name="", model="openai/gpt-4o")

    def test_none_name_raises(self):
        with pytest.raises(ValueError, match="non-empty string"):
            Agent(name=None, model="openai/gpt-4o")

    def test_special_chars_raises(self):
        with pytest.raises(ValueError, match="Invalid agent name"):
            Agent(name="my agent!", model="openai/gpt-4o")

    def test_starts_with_number_raises(self):
        with pytest.raises(ValueError, match="Invalid agent name"):
            Agent(name="123agent", model="openai/gpt-4o")

    def test_valid_underscore_name(self):
        agent = Agent(name="_private", model="openai/gpt-4o")
        assert agent.name == "_private"

    def test_valid_hyphen_name(self):
        agent = Agent(name="my-agent", model="openai/gpt-4o")
        assert agent.name == "my-agent"

    def test_valid_alphanumeric(self):
        agent = Agent(name="agent_v2", model="openai/gpt-4o")
        assert agent.name == "agent_v2"


class TestAgentMaxTurnsValidation:
    """Test Agent max_turns validation."""

    def test_zero_raises(self):
        with pytest.raises(ValueError, match="max_turns must be >= 1"):
            Agent(name="test", model="openai/gpt-4o", max_turns=0)

    def test_negative_raises(self):
        with pytest.raises(ValueError, match="max_turns must be >= 1"):
            Agent(name="test", model="openai/gpt-4o", max_turns=-1)

    def test_one_is_valid(self):
        agent = Agent(name="test", model="openai/gpt-4o", max_turns=1)
        assert agent.max_turns == 1

    def test_default_25(self):
        agent = Agent(name="test", model="openai/gpt-4o")
        assert agent.max_turns == 25


class TestAgentEdgeCases:
    """Additional edge case tests for Agent."""

    def test_rshift_with_external_agent(self):
        a = Agent(name="a", model="openai/gpt-4o")
        b = Agent(name="b")  # external
        pipeline = a >> b
        assert pipeline.strategy == "sequential"
        assert len(pipeline.agents) == 2
        assert pipeline.agents[1].external is True

    def test_empty_tools_list(self):
        agent = Agent(name="test", model="openai/gpt-4o", tools=[])
        assert agent.tools == []

    def test_empty_agents_list(self):
        agent = Agent(name="test", model="openai/gpt-4o", agents=[])
        assert agent.agents == []

    def test_external_agent_detection(self):
        agent = Agent(name="ext")
        assert agent.external is True
        assert agent.model == ""

    def test_non_external_agent(self):
        agent = Agent(name="test", model="openai/gpt-4o")
        assert agent.external is False
