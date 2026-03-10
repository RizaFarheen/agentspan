# Copyright (c) 2025 AgentSpan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Unit tests for WorkerManager."""

from unittest.mock import MagicMock, patch

from agentspan.agents.runtime.worker_manager import WorkerManager


class TestWorkerManagerInit:
    """Test WorkerManager constructor."""

    def test_defaults(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        assert wm._poll_interval_ms == 100
        assert wm._thread_count == 1
        assert wm._daemon is True
        assert wm._task_handler is None

    def test_custom_params(self):
        config = MagicMock()
        wm = WorkerManager(
            configuration=config,
            poll_interval_ms=500,
            thread_count=4,
            daemon=False,
        )
        assert wm._poll_interval_ms == 500
        assert wm._thread_count == 4
        assert wm._daemon is False


class TestWorkerManagerStart:
    """Test WorkerManager.start()."""

    @patch("conductor.client.automator.task_handler.TaskHandler")
    def test_start_creates_task_handler(self, MockTaskHandler):
        config = MagicMock()
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = []
        mock_handler.metrics_provider_process = None
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        MockTaskHandler.return_value = mock_handler

        wm = WorkerManager(configuration=config)
        wm.start()

        MockTaskHandler.assert_called_once_with(
            workers=[],
            configuration=config,
            scan_for_annotated_workers=True,
        )
        mock_handler.start_processes.assert_called_once()

    @patch("conductor.client.automator.task_handler.TaskHandler")
    def test_start_sets_daemon_on_processes(self, MockTaskHandler):
        config = MagicMock()
        mock_proc = MagicMock()
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = [mock_proc]
        mock_handler.metrics_provider_process = MagicMock()
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        MockTaskHandler.return_value = mock_handler

        wm = WorkerManager(configuration=config, daemon=True)
        wm.start()

        assert mock_proc.daemon is True
        assert mock_handler.metrics_provider_process.daemon is True

    @patch("conductor.client.automator.task_handler.TaskHandler")
    def test_start_idempotent(self, MockTaskHandler):
        config = MagicMock()
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = []
        mock_handler.metrics_provider_process = None
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        MockTaskHandler.return_value = mock_handler

        wm = WorkerManager(configuration=config)
        wm.start()
        wm.start()  # second call is no-op

        MockTaskHandler.assert_called_once()

    @patch("conductor.client.automator.task_handler.TaskHandler")
    def test_start_no_daemon(self, MockTaskHandler):
        """When daemon=False, processes should not be set to daemon."""
        config = MagicMock()
        mock_proc = MagicMock()
        mock_proc.daemon = False
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = [mock_proc]
        mock_handler.metrics_provider_process = MagicMock()
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        MockTaskHandler.return_value = mock_handler

        wm = WorkerManager(configuration=config, daemon=False)
        wm.start()

        # daemon was False, so processes should not have been set
        assert mock_proc.daemon is False


class TestWorkerManagerStop:
    """Test WorkerManager.stop()."""

    def test_stop_calls_stop_processes(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_handler = MagicMock()
        wm._task_handler = mock_handler

        wm.stop()

        mock_handler.stop_processes.assert_called_once()
        assert wm._task_handler is None

    def test_stop_idempotent(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        # No handler set
        wm.stop()  # Should not raise

    def test_stop_thread_safe(self):
        """Multiple concurrent stop calls should not crash."""
        import threading

        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_handler = MagicMock()
        wm._task_handler = mock_handler

        errors = []

        def stop_worker():
            try:
                wm.stop()
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=stop_worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0


class TestWorkerManagerIsRunning:
    """Test WorkerManager.is_running()."""

    def test_is_running_no_handler(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        assert wm.is_running() is False

    def test_is_running_with_alive_process(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_proc = MagicMock()
        mock_proc.is_alive.return_value = True
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = [mock_proc]
        wm._task_handler = mock_handler

        assert wm.is_running() is True

    def test_is_running_with_dead_processes(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_proc = MagicMock()
        mock_proc.is_alive.return_value = False
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = [mock_proc]
        wm._task_handler = mock_handler

        assert wm.is_running() is False

    def test_is_running_exception_returns_false(self):
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_handler = MagicMock()
        # Make task_runner_processes iteration raise
        mock_handler.task_runner_processes.__iter__ = MagicMock(side_effect=RuntimeError("boom"))
        wm._task_handler = mock_handler

        assert wm.is_running() is False


class TestWorkerManagerContextManager:
    """Test WorkerManager as context manager."""

    @patch("conductor.client.automator.task_handler.TaskHandler")
    def test_context_manager(self, MockTaskHandler):
        config = MagicMock()
        mock_handler = MagicMock()
        mock_handler.task_runner_processes = []
        mock_handler.metrics_provider_process = None
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        MockTaskHandler.return_value = mock_handler

        with WorkerManager(configuration=config) as wm:
            assert wm._task_handler is not None

        mock_handler.stop_processes.assert_called_once()


class TestWorkerManagerLoggerCleanup:
    """Test _register_logger_cleanup internals."""

    def test_register_logger_cleanup_no_handler(self):
        """When _task_handler is None, _register_logger_cleanup returns early."""
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        wm._task_handler = None
        # Should not raise
        wm._register_logger_cleanup()

    @patch("atexit.register")
    def test_register_logger_cleanup_registers_atexit(self, mock_atexit_reg):
        """_register_logger_cleanup registers an atexit handler."""
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_handler = MagicMock()
        mock_handler.queue = MagicMock()
        mock_handler.logger_process = MagicMock()
        wm._task_handler = mock_handler

        wm._register_logger_cleanup()

        mock_atexit_reg.assert_called_once()
        cleanup_fn = mock_atexit_reg.call_args[0][0]
        assert callable(cleanup_fn)

    @patch("atexit.register")
    def test_logger_cleanup_function_works(self, mock_atexit_reg):
        """The registered cleanup function sends None to queue and joins logger."""
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_queue = MagicMock()
        mock_logger_proc = MagicMock()
        mock_logger_proc.is_alive.return_value = False
        mock_handler = MagicMock()
        mock_handler.queue = mock_queue
        mock_handler.logger_process = mock_logger_proc
        wm._task_handler = mock_handler

        wm._register_logger_cleanup()

        cleanup_fn = mock_atexit_reg.call_args[0][0]
        cleanup_fn()

        mock_queue.put_nowait.assert_called_once_with(None)
        mock_logger_proc.join.assert_called_once_with(timeout=2)

    @patch("atexit.register")
    def test_logger_cleanup_terminates_stuck_process(self, mock_atexit_reg):
        """If logger process is still alive after join, terminate it."""
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_queue = MagicMock()
        mock_logger_proc = MagicMock()
        mock_logger_proc.is_alive.return_value = True
        mock_handler = MagicMock()
        mock_handler.queue = mock_queue
        mock_handler.logger_process = mock_logger_proc
        wm._task_handler = mock_handler

        wm._register_logger_cleanup()

        cleanup_fn = mock_atexit_reg.call_args[0][0]
        cleanup_fn()

        mock_logger_proc.terminate.assert_called_once()
        assert mock_logger_proc.join.call_count == 2

    @patch("atexit.register")
    def test_logger_cleanup_handles_exception(self, mock_atexit_reg):
        """Cleanup function should not raise even if queue.put_nowait fails."""
        config = MagicMock()
        wm = WorkerManager(configuration=config)
        mock_queue = MagicMock()
        mock_queue.put_nowait.side_effect = RuntimeError("queue broken")
        mock_handler = MagicMock()
        mock_handler.queue = mock_queue
        mock_handler.logger_process = MagicMock()
        wm._task_handler = mock_handler

        wm._register_logger_cleanup()

        cleanup_fn = mock_atexit_reg.call_args[0][0]
        cleanup_fn()  # Should not raise
