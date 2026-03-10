# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Runtime package — execution lifecycle management."""

from agentspan.agents.runtime.runtime import AgentRuntime
from agentspan.agents.runtime.config import AgentConfig

__all__ = ["AgentRuntime", "AgentConfig"]
