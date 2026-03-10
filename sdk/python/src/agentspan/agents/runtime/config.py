# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Configuration — load settings from environment variables.

Wraps ``conductor.client.configuration.Configuration`` and adds
agents-specific defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentConfig:
    """Configuration for the agents runtime.

    Values are loaded from environment variables with sensible defaults.
    The Conductor server URL, key, and secret are required and are read
    from the same env vars as ``conductor-python``.

    Attributes:
        server_url: Conductor server API URL.
        auth_key: Conductor auth key (optional for OSS).
        auth_secret: Conductor auth secret (optional for OSS).
        default_timeout_seconds: Default workflow timeout.
        worker_poll_interval_ms: Worker polling interval in milliseconds.
        worker_thread_count: Number of threads per worker.
        auto_start_workers: Whether to auto-start worker processes.
        daemon_workers: Whether worker processes are daemon (killed on exit).
        auto_register_integrations: When ``True``, automatically create LLM
            integrations and register models on the Conductor server before
            executing agents.  Reads API keys from provider-specific env vars
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

        Reads:
            - ``CONDUCTOR_SERVER_URL`` — Conductor API URL
            - ``CONDUCTOR_AUTH_KEY`` — Auth key (optional)
            - ``CONDUCTOR_AUTH_SECRET`` — Auth secret (optional)
            - ``CONDUCTOR_AGENT_TIMEOUT`` — Default timeout in seconds
            - ``CONDUCTOR_LLM_RETRY_COUNT`` — LLM task retry count
            - ``CONDUCTOR_WORKER_POLL_INTERVAL`` — Worker poll interval (ms)
            - ``CONDUCTOR_WORKER_THREADS`` — Worker thread count
            - ``CONDUCTOR_DAEMON_WORKERS`` — Use daemon worker processes (default true)
            - ``CONDUCTOR_INTEGRATIONS_AUTO_REGISTER`` — Auto-register LLM
              integrations and models on the server (default false)
        """
        return cls(
            server_url=os.environ.get("CONDUCTOR_SERVER_URL", ""),
            auth_key=os.environ.get("CONDUCTOR_AUTH_KEY"),
            auth_secret=os.environ.get("CONDUCTOR_AUTH_SECRET"),
            default_timeout_seconds=int(
                os.environ.get("CONDUCTOR_AGENT_TIMEOUT", "0")
            ),
            llm_retry_count=int(
                os.environ.get("CONDUCTOR_LLM_RETRY_COUNT", "3")
            ),
            worker_poll_interval_ms=int(
                os.environ.get("CONDUCTOR_WORKER_POLL_INTERVAL", "100")
            ),
            worker_thread_count=int(
                os.environ.get("CONDUCTOR_WORKER_THREADS", "1")
            ),
            daemon_workers=os.environ.get(
                "CONDUCTOR_DAEMON_WORKERS", "true"
            ).lower() in ("true", "1", "yes"),
            auto_register_integrations=os.environ.get(
                "CONDUCTOR_INTEGRATIONS_AUTO_REGISTER", "false"
            ).lower() in ("true", "1", "yes"),
            streaming_enabled=os.environ.get(
                "CONDUCTOR_STREAMING_ENABLED", "true"
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
