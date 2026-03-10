"""Generic framework support for running foreign agents on the Conductor runtime.

This package contains zero framework-specific code. It provides:
- Auto-detection of agent framework from object type
- Generic deep serialization of any agent object to JSON
- Callable extraction and worker registration
"""

from agentspan.agents.frameworks.serializer import (
    detect_framework,
    serialize_agent,
    WorkerInfo,
)

__all__ = ["detect_framework", "serialize_agent", "WorkerInfo"]
