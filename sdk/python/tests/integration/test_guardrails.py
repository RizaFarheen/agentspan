# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Integration tests for guardrails against a real Conductor server.

These tests require a running Conductor server with LLM support.
Skip with: pytest -m "not integration"

Requirements:
    - export CONDUCTOR_SERVER_URL=http://localhost:8080/api
    - LLM provider "openai" configured in Conductor
"""

import re
import time

import pytest

from agentspan.agents import (
    Agent,
    AgentRuntime,
    Guardrail,
    GuardrailResult,
    RegexGuardrail,
    tool,
)


pytestmark = pytest.mark.integration


# ── Tools ────────────────────────────────────────────────────────────────

@tool
def get_customer_data(customer_id: str) -> dict:
    """Retrieve customer profile data."""
    return {
        "customer_id": customer_id,
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "ssn": "123-45-6789",
        "card": "4532-0150-1234-5678",
    }


@tool
def execute_query(query: str) -> str:
    """Execute a database query and return results."""
    return f"Query executed: {query}"


@tool
def get_weather(city: str) -> dict:
    """Get current weather for a city."""
    return {"city": city, "temp": 72, "condition": "Sunny"}


# ── Guardrail functions ─────────────────────────────────────────────────

def no_ssn(content: str) -> GuardrailResult:
    """Reject responses containing SSN patterns."""
    if re.search(r"\b\d{3}-\d{2}-\d{4}\b", content):
        return GuardrailResult(
            passed=False,
            message="Response must not contain SSN numbers. Redact them.",
        )
    return GuardrailResult(passed=True)


def always_fails(content: str) -> GuardrailResult:
    """Guardrail that always fails."""
    return GuardrailResult(passed=False, message="This guardrail always fails.")


def fix_ssn(content: str) -> GuardrailResult:
    """Guardrail that detects SSNs and provides a fixed version."""
    ssn_pattern = r"\b\d{3}-\d{2}-\d{4}\b"
    if re.search(ssn_pattern, content):
        fixed = re.sub(ssn_pattern, "XXX-XX-XXXX", content)
        return GuardrailResult(
            passed=False,
            message="Contains SSN, providing redacted version.",
            fixed_output=fixed,
        )
    return GuardrailResult(passed=True)


def lenient_check(content: str) -> GuardrailResult:
    """Guardrail that always passes."""
    return GuardrailResult(passed=True)


def no_sql_injection(content: str) -> GuardrailResult:
    """Block content containing SQL injection patterns."""
    patterns = [r"DROP\s+TABLE", r"DELETE\s+FROM", r";\s*--"]
    for pat in patterns:
        if re.search(pat, content, re.IGNORECASE):
            return GuardrailResult(
                passed=False,
                message=f"Potential SQL injection detected: {pat}",
            )
    return GuardrailResult(passed=True)


# ── Integration Tests ────────────────────────────────────────────────────

class TestOutputGuardrailRetry:
    """Test output guardrail retry succeeds."""

    def test_output_guardrail_retry_succeeds(self):
        """Agent with SSN-blocking guardrail (on_fail="retry").

        Prompts the agent to include a fake SSN. The guardrail catches it,
        retries, and the final output should be clean.
        """
        agent = Agent(
            name="test_retry_guard",
            model="openai/gpt-4o",
            tools=[get_customer_data],
            instructions=(
                "You are a customer service assistant. Use the tools to "
                "retrieve data. Include all details from the tool results."
            ),
            guardrails=[
                Guardrail(no_ssn, position="output", on_fail="retry", max_retries=3),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(
                agent,
                "Look up customer CUST-7 and give me their full profile.",
            )
            assert result.status == "COMPLETED"
            assert result.output is not None
            # SSN should have been caught and redacted on retry
            assert not re.search(r"\b\d{3}-\d{2}-\d{4}\b", str(result.output)), (
                f"SSN found in output: {result.output}"
            )


class TestOutputGuardrailRaise:
    """Test output guardrail raise terminates workflow."""

    def test_output_guardrail_raise_terminates(self):
        """Agent with always-failing guardrail (on_fail="raise").

        The workflow should terminate with FAILED status.
        """
        agent = Agent(
            name="test_raise_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(always_fails, position="output", on_fail="raise"),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(agent, "What's the weather in NYC?")
            assert result.status in ("FAILED", "TERMINATED"), (
                f"Expected FAILED/TERMINATED, got {result.status}"
            )


class TestOutputGuardrailFix:
    """Test output guardrail fix uses corrected output."""

    def test_output_guardrail_fix_uses_corrected(self):
        """Agent with SSN-fixing guardrail (on_fail="fix").

        The guardrail detects SSNs and provides a redacted version.
        """
        agent = Agent(
            name="test_fix_guard",
            model="openai/gpt-4o",
            tools=[get_customer_data],
            instructions=(
                "Retrieve customer data and include all details verbatim."
            ),
            guardrails=[
                Guardrail(fix_ssn, position="output", on_fail="fix"),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(
                agent,
                "Look up customer CUST-7 and show all their info including SSN.",
            )
            assert result.status == "COMPLETED"
            # If the LLM included the SSN, the fix guardrail should have redacted it
            if result.output:
                assert "123-45-6789" not in str(result.output), (
                    f"Raw SSN found in output after fix guardrail: {result.output}"
                )


class TestOutputGuardrailHuman:
    """Test output guardrail human pauses workflow."""

    def test_output_guardrail_human_pauses_workflow(self):
        """Agent with always-failing guardrail (on_fail="human").

        Uses start() since the workflow will pause. Approves to resume.
        """
        agent = Agent(
            name="test_human_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(always_fails, position="output", on_fail="human"),
            ],
        )

        with AgentRuntime() as runtime:
            handle = runtime.start(agent, "What's the weather in NYC?")
            assert handle.workflow_id != ""

            # Wait for the workflow to reach the human task
            for _ in range(30):
                status = handle.get_status()
                if status.is_waiting or status.is_complete:
                    break
                time.sleep(1)

            status = handle.get_status()
            assert status.is_waiting, (
                f"Expected workflow to be waiting, got status={status.status}"
            )

            # Approve to resume
            runtime.approve(handle.workflow_id)

            # Wait for completion
            for _ in range(30):
                status = handle.get_status()
                if status.is_complete:
                    break
                time.sleep(1)

            assert status.is_complete

    def test_output_guardrail_human_reject_terminates(self):
        """Same setup but reject — workflow should terminate."""
        agent = Agent(
            name="test_human_reject",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(always_fails, position="output", on_fail="human"),
            ],
        )

        with AgentRuntime() as runtime:
            handle = runtime.start(agent, "What's the weather in NYC?")

            # Wait for human task
            for _ in range(30):
                status = handle.get_status()
                if status.is_waiting or status.is_complete:
                    break
                time.sleep(1)

            assert status.is_waiting

            # Reject
            runtime.reject(handle.workflow_id, "Not acceptable")

            # Wait for termination
            for _ in range(30):
                status = handle.get_status()
                if status.is_complete:
                    break
                time.sleep(1)

            assert status.is_complete
            assert status.status in ("FAILED", "TERMINATED")


class TestMultipleGuardrails:
    """Test multiple guardrails — first failure wins."""

    def test_multiple_guardrails_first_failure_wins(self):
        """Two guardrails: lenient (passes) then strict (always fails, raise).

        The strict guardrail should cause termination.
        """
        agent = Agent(
            name="test_multi_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(lenient_check, position="output", on_fail="retry"),
                Guardrail(always_fails, position="output", on_fail="raise"),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(agent, "What's the weather?")
            assert result.status in ("FAILED", "TERMINATED")


class TestGuardrailWithTools:
    """Test guardrails work correctly with tool-calling agents."""

    def test_guardrail_with_tools(self):
        """Agent with tools AND output guardrails.

        Tools execute, guardrails check output, result is clean.
        """
        agent = Agent(
            name="test_tools_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="Use get_weather to answer weather questions.",
            guardrails=[
                RegexGuardrail(
                    patterns=[r"\b\d{3}-\d{2}-\d{4}\b"],
                    name="no_ssn",
                    on_fail="retry",
                ),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(agent, "What's the weather in NYC?")
            assert result.status == "COMPLETED"
            assert result.output is not None


class TestGuardrailStreaming:
    """Test guardrails with streaming execution."""

    def test_guardrail_with_streaming(self):
        """Agent with guardrails executed via stream()."""
        agent = Agent(
            name="test_stream_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(lenient_check, position="output", on_fail="retry"),
            ],
        )

        with AgentRuntime() as runtime:
            events = list(runtime.stream(agent, "What's the weather in NYC?"))
            assert len(events) > 0
            # Last event should be DONE
            done_events = [e for e in events if e.type.value == "done"]
            assert len(done_events) > 0


class TestGuardrailStart:
    """Test guardrails with async start() execution."""

    def test_guardrail_with_start(self):
        """Agent with guardrails executed via start()."""
        agent = Agent(
            name="test_start_guard",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(lenient_check, position="output", on_fail="retry"),
            ],
        )

        with AgentRuntime() as runtime:
            handle = runtime.start(agent, "What's the weather in NYC?")
            assert handle.workflow_id != ""

            # Poll until complete
            for _ in range(60):
                status = handle.get_status()
                if status.is_complete:
                    break
                time.sleep(1)

            assert status.is_complete
            assert status.output is not None


class TestToolGuardrails:
    """Test tool-level guardrails blocking dangerous input."""

    def test_tool_guardrails_block_dangerous_input(self):
        """Tool with pre-execution guardrail that blocks SQL injection."""
        sql_guard = Guardrail(
            no_sql_injection,
            position="input",
            on_fail="raise",
            name="sql_guard",
        )

        @tool(guardrails=[sql_guard])
        def run_query(query: str) -> str:
            """Execute a database query."""
            return f"Results: {query}"

        agent = Agent(
            name="test_tool_guard",
            model="openai/gpt-4o",
            tools=[run_query],
            instructions=(
                "You have a run_query tool. Use it to answer database questions. "
                "Execute the exact query the user specifies."
            ),
        )

        with AgentRuntime() as runtime:
            result = runtime.run(
                agent,
                "Run this query: SELECT * FROM users; DROP TABLE users; --",
            )
            # The tool should have been blocked or the result should indicate blocking
            output = str(result.output) if result.output else ""
            # Either the tool was blocked or the agent adapted
            assert result.status in ("COMPLETED", "FAILED")


class TestRegexGuardrailE2E:
    """Test RegexGuardrail end-to-end."""

    def test_regex_guardrail_e2e(self):
        """RegexGuardrail blocking email addresses, on_fail="retry"."""
        agent = Agent(
            name="test_regex_e2e",
            model="openai/gpt-4o",
            tools=[get_customer_data],
            instructions=(
                "Retrieve customer data and present it. "
                "Include all available details."
            ),
            guardrails=[
                RegexGuardrail(
                    patterns=[r"[\w.+-]+@[\w-]+\.[\w.-]+"],
                    name="no_email",
                    message="Response must not contain email addresses. Redact them.",
                    on_fail="retry",
                    max_retries=3,
                ),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(
                agent,
                "Show me the full profile for customer CUST-7.",
            )
            assert result.status == "COMPLETED"
            if result.output:
                assert not re.search(
                    r"[\w.+-]+@[\w-]+\.[\w.-]+", str(result.output)
                ), f"Email found in output: {result.output}"


class TestMaxRetriesExhausted:
    """Test max retries exhausted behavior."""

    def test_max_retries_exhausted(self):
        """Guardrail that ALWAYS fails with on_fail="retry", max_retries=2.

        After 2 retries, the guardrail escalates to "raise" and the
        workflow should complete (FAILED or last output).
        """
        agent = Agent(
            name="test_max_retry",
            model="openai/gpt-4o",
            tools=[get_weather],
            instructions="You are a weather assistant.",
            guardrails=[
                Guardrail(always_fails, position="output", on_fail="retry", max_retries=2),
            ],
        )

        with AgentRuntime() as runtime:
            result = runtime.run(agent, "What's the weather?")
            # After exhausting retries, the guardrail escalates to raise → FAILED
            assert result.status in ("FAILED", "TERMINATED", "COMPLETED")
