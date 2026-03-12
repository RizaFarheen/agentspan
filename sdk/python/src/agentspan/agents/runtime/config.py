# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Configuration — load settings from environment variables.

Wraps ``conductor.client.configuration.Configuration`` and adds
agents-specific defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

_DEFAULT_SERVER_URL = "http://localhost:8080/api"


def _env(new_name: str, old_name: str, default: Optional[str] = None) -> Optional[str]:
    """Read an ``AGENTSPAN_*`` env var, falling back to ``CONDUCTOR_*``.

    The ``AGENTSPAN_*`` prefix is the primary name.  The ``CONDUCTOR_*``
    prefix is accepted for backward compatibility but is deprecated.
    """
    val = os.environ.get(new_name)
    if val is not None:
        return val
    return os.environ.get(old_name, default)


@dataclass
class AgentConfig:
    """Configuration for the agents runtime.

    Values are loaded from environment variables with sensible defaults.

    Attributes:
        server_url: Agentspan server API URL.
        auth_key: Auth key (optional for OSS).
        auth_secret: Auth secret (optional for OSS).
        default_timeout_seconds: Default workflow timeout.
        worker_poll_interval_ms: Worker polling interval in milliseconds.
        worker_thread_count: Number of threads per worker.
        auto_start_workers: Whether to auto-start worker processes.
        daemon_workers: Whether worker processes are daemon (killed on exit).
        auto_register_integrations: When ``True``, automatically create LLM
            integrations and register models on the server before executing
            agents.  Reads API keys from provider-specific env vars
            (e.g. ``OPENAI_API_KEY``).
    """

    server_url: str = ""
    auth_key: Optional[str] = None
    auth_secret: Optional[str] = None
    default_timeout_seconds: int = 0
    llm_retry_count: int = 3
    worker_poll_interval_ms: int = 100
    worker_thread_count: int = 1
    auto_start_workers: bool = True
    daemon_workers: bool = True
    auto_register_integrations: bool = False
    streaming_enabled: bool = True

    @property
    def api_key(self) -> Optional[str]:
        """Alias for :attr:`auth_key` (industry-standard naming)."""
        return self.auth_key

    @property
    def api_secret(self) -> Optional[str]:
        """Alias for :attr:`auth_secret` (industry-standard naming)."""
        return self.auth_secret

    @classmethod
    def from_env(cls) -> "AgentConfig":
        """Create configuration from environment variables.

        Reads (``AGENTSPAN_*`` is primary; ``CONDUCTOR_*`` is accepted
        for backward compatibility):

            - ``AGENTSPAN_SERVER_URL`` — Agentspan server API URL
              (default ``http://localhost:8080/api``)
            - ``AGENTSPAN_AUTH_KEY`` — Auth key (optional)
            - ``AGENTSPAN_AUTH_SECRET`` — Auth secret (optional)
            - ``AGENTSPAN_AGENT_TIMEOUT`` — Default timeout in seconds
            - ``AGENTSPAN_LLM_RETRY_COUNT`` — LLM task retry count
            - ``AGENTSPAN_WORKER_POLL_INTERVAL`` — Worker poll interval (ms)
            - ``AGENTSPAN_WORKER_THREADS`` — Worker thread count
            - ``AGENTSPAN_DAEMON_WORKERS`` — Use daemon workers (default true)
            - ``AGENTSPAN_INTEGRATIONS_AUTO_REGISTER`` — Auto-register LLM
              integrations and models on the server (default false)
            - ``AGENTSPAN_STREAMING_ENABLED`` — Enable SSE streaming (default true)
        """
        return cls(
            server_url=_env(
                "AGENTSPAN_SERVER_URL", "CONDUCTOR_SERVER_URL", _DEFAULT_SERVER_URL
            ) or _DEFAULT_SERVER_URL,
            auth_key=_env("AGENTSPAN_AUTH_KEY", "CONDUCTOR_AUTH_KEY"),
            auth_secret=_env("AGENTSPAN_AUTH_SECRET", "CONDUCTOR_AUTH_SECRET"),
            default_timeout_seconds=int(
                _env("AGENTSPAN_AGENT_TIMEOUT", "CONDUCTOR_AGENT_TIMEOUT", "0") or "0"
            ),
            llm_retry_count=int(
                _env("AGENTSPAN_LLM_RETRY_COUNT", "CONDUCTOR_LLM_RETRY_COUNT", "3") or "3"
            ),
            worker_poll_interval_ms=int(
                _env("AGENTSPAN_WORKER_POLL_INTERVAL", "CONDUCTOR_WORKER_POLL_INTERVAL", "100")
                or "100"
            ),
            worker_thread_count=int(
                _env("AGENTSPAN_WORKER_THREADS", "CONDUCTOR_WORKER_THREADS", "1") or "1"
            ),
            daemon_workers=(
                _env("AGENTSPAN_DAEMON_WORKERS", "CONDUCTOR_DAEMON_WORKERS", "true") or "true"
            ).lower() in ("true", "1", "yes"),
            auto_register_integrations=(
                _env(
                    "AGENTSPAN_INTEGRATIONS_AUTO_REGISTER",
                    "CONDUCTOR_INTEGRATIONS_AUTO_REGISTER",
                    "false",
                )
                or "false"
            ).lower() in ("true", "1", "yes"),
            streaming_enabled=(
                _env("AGENTSPAN_STREAMING_ENABLED", "CONDUCTOR_STREAMING_ENABLED", "true")
                or "true"
            ).lower() in ("true", "1", "yes"),
        )

    def to_conductor_configuration(self) -> "Configuration":
        """Convert to a ``conductor-python`` :class:`Configuration` object."""
        from conductor.client.configuration.configuration import Configuration

        config = Configuration(server_api_url=self.server_url)
        if self.auth_key:
            from conductor.client.configuration.settings.authentication_settings import AuthenticationSettings
            config.authentication_settings = AuthenticationSettings(
                key_id=self.auth_key,
                key_secret=self.auth_secret or "",
            )
        return config
