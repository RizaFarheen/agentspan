# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Worker manager — auto-registers @tool functions as Conductor workers.

Bridges ``@tool``-decorated Python functions to Conductor's
:class:`TaskHandler` and ``@worker_task`` system, so that tool functions
are executed as distributed Conductor worker tasks.
"""

from __future__ import annotations

import atexit
import logging
import threading
from typing import TYPE_CHECKING, Any, Dict, List, Optional

logger = logging.getLogger("agentspan.agents.worker_manager")

if TYPE_CHECKING:
    from conductor.client.automator.task_handler import TaskHandler
    from conductor.client.configuration.configuration import Configuration

    from agentspan.agents.tool import ToolDef


class _SchemaRegistryFilter(logging.Filter):
    """Allow the first schema-registry warning through, suppress the rest."""

    def __init__(self) -> None:
        super().__init__()
        self._seen = False

    def filter(self, record: logging.LogRecord) -> bool:
        if "Schema registry" in record.getMessage():
            if self._seen:
                return False
            self._seen = True
        return True


class WorkerManager:
    """Manages Conductor worker processes for ``@tool`` functions."""

    def __init__(
        self,
        configuration: "Configuration",
        poll_interval_ms: int = 100,
        thread_count: int = 1,
        daemon: bool = True,
    ) -> None:
        self._configuration = configuration
        self._poll_interval_ms = poll_interval_ms
        self._thread_count = thread_count
        self._daemon = daemon
        self._task_handler: Optional["TaskHandler"] = None
        self._lock = threading.Lock()

        # Suppress repeated schema-registry warnings from Conductor
        logging.getLogger("conductor.client.automator.task_runner").addFilter(
            _SchemaRegistryFilter()
        )

    def start(self) -> None:
        """Start worker processes for all registered tools."""
        from conductor.client.automator.task_handler import TaskHandler

        if self._task_handler is not None:
            return

        logger.info("Starting worker processes (poll_interval=%dms, threads=%d, daemon=%s)",
                     self._poll_interval_ms, self._thread_count, self._daemon)
        self._task_handler = TaskHandler(
            workers=[],
            configuration=self._configuration,
            scan_for_annotated_workers=True,
        )

        # Set worker processes to daemon BEFORE starting them.
        # Daemon processes are killed automatically when the main process
        # exits, preventing the process hang after run() completes.
        if self._daemon:
            for proc in self._task_handler.task_runner_processes:
                proc.daemon = True
            if self._task_handler.metrics_provider_process is not None:
                self._task_handler.metrics_provider_process.daemon = True

        # The logger process was already started in TaskHandler.__init__()
        # (cannot set daemon after start). Register an atexit handler to
        # send the sentinel None to the log queue so it exits cleanly
        # before multiprocessing's _exit_function tries to join it.
        self._register_logger_cleanup()

        self._task_handler.start_processes()

    def _register_logger_cleanup(self) -> None:
        """Register an atexit handler to cleanly stop the logger process."""
        handler = self._task_handler
        if handler is None:
            return

        queue = handler.queue
        logger_proc = handler.logger_process

        def _cleanup_logger():
            try:
                queue.put_nowait(None)
                logger_proc.join(timeout=2)
                if logger_proc.is_alive():
                    logger_proc.terminate()
                    logger_proc.join(timeout=1)
            except Exception:
                pass

        atexit.register(_cleanup_logger)

    def stop(self) -> None:
        """Stop all worker processes."""
        with self._lock:
            if self._task_handler is not None:
                logger.info("Stopping worker processes")
                self._task_handler.stop_processes()
                self._task_handler = None

    def is_running(self) -> bool:
        """Check if workers are running."""
        if self._task_handler is None:
            return False
        try:
            return any(
                p.is_alive() for p in self._task_handler.task_runner_processes
            )
        except Exception:
            return False

    def __enter__(self) -> "WorkerManager":
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        self.stop()
