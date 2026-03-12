# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Model configuration for examples.

Set the ``AGENT_LLM_MODEL`` environment variable to override the default model
used by all examples::

    export AGENT_LLM_MODEL="anthropic/claude-sonnet-4-20250514"
    export AGENT_LLM_MODEL="google_gemini/gemini-2.0-flash"
    export AGENT_LLM_MODEL="openai/gpt-4o-mini"

If unset, defaults to ``openai/gpt-4o``.
"""

from __future__ import annotations

import os

DEFAULT_MODEL = "openai/gpt-5-mini"


def get_model(override: str | None = None) -> str:
    """Return the LLM model string for examples.

    Priority: *override* argument > ``AGENT_LLM_MODEL`` env var > default.
    """
    if override:
        return override
    return os.environ.get("AGENT_LLM_MODEL", DEFAULT_MODEL)
