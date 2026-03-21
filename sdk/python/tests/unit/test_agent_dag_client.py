# sdk/python/tests/unit/test_agent_dag_client.py
"""Unit tests for _AgentDagClient — the DAG task injection HTTP client."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from agentspan.agents.frameworks.claude import _AgentDagClient


def _mock_httpx_cm(mock_client):
    """Build a mock that acts as `async with httpx.AsyncClient(...) as client:`."""
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=mock_client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=cm)


class TestInjectTask:
    def test_posts_to_correct_url(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"taskId": "cond-task-1"}
        mock_resp.raise_for_status = MagicMock()
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_resp)

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            task_id = asyncio.run(
                dag.inject_task("wf-1", "Bash", "tu-001", {"command": "ls"})
            )

        url = mock_http.post.call_args[0][0]
        assert "/api/agent/wf-1/tasks" in url
        assert task_id == "cond-task-1"

    def test_posts_correct_simple_payload(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"taskId": "t-1"}
        mock_resp.raise_for_status = MagicMock()
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_resp)

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            asyncio.run(dag.inject_task("wf-1", "Bash", "tu-001", {"command": "ls"}))

        body = mock_http.post.call_args[1]["json"]
        assert body["taskDefName"] == "Bash"
        assert body["referenceTaskName"] == "tu-001"
        assert body["type"] == "SIMPLE"
        assert body["inputData"] == {"command": "ls"}
        assert body["status"] == "IN_PROGRESS"

    def test_posts_sub_workflow_payload(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"taskId": "t-2"}
        mock_resp.raise_for_status = MagicMock()
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_resp)
        sub_param = {"name": "_fw_claude_agent", "version": 1, "workflowId": "child-wf-1"}

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            asyncio.run(
                dag.inject_task(
                    "wf-1", "claude-sub-agent", "tu-002", {},
                    task_type="SUB_WORKFLOW", sub_workflow_param=sub_param
                )
            )

        body = mock_http.post.call_args[1]["json"]
        assert body["type"] == "SUB_WORKFLOW"
        assert body["subWorkflowParam"] == sub_param

    def test_swallows_http_exception(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        bad_cm = MagicMock()
        bad_cm.__aenter__ = AsyncMock(side_effect=Exception("network down"))
        bad_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", MagicMock(return_value=bad_cm)):
            result = asyncio.run(
                dag.inject_task("wf-1", "Bash", "tu-001", {"command": "ls"})
            )
        assert result is None  # non-fatal: returns None on error


class TestCreateTrackingWorkflow:
    def test_posts_to_workflow_endpoint(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"workflowId": "new-wf-1"}
        mock_resp.raise_for_status = MagicMock()
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_resp)

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            wf_id = asyncio.run(
                dag.create_tracking_workflow("_fw_claude_myagent", {"prompt": "do it"})
            )

        url = mock_http.post.call_args[0][0]
        assert "/api/agent/workflow" in url
        body = mock_http.post.call_args[1]["json"]
        assert body["workflowName"] == "_fw_claude_myagent"
        assert body["input"] == {"prompt": "do it"}
        assert wf_id == "new-wf-1"

    def test_swallows_exception_returns_none(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        bad_cm = MagicMock()
        bad_cm.__aenter__ = AsyncMock(side_effect=Exception("down"))
        bad_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", MagicMock(return_value=bad_cm)):
            result = asyncio.run(dag.create_tracking_workflow("_fw_claude_x", {}))
        assert result is None


class TestCompleteTask:
    def test_posts_to_api_task_with_completed_status(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            asyncio.run(dag.complete_task("wf-1", "cond-t-1", {"result": "hello"}))

        url = mock_http.post.call_args[0][0]
        assert "/api/task" in url
        body = mock_http.post.call_args[1]["json"]
        assert body["taskId"] == "cond-t-1"
        assert body["workflowInstanceId"] == "wf-1"
        assert body["status"] == "COMPLETED"
        assert body["outputData"] == {"result": "hello"}

    def test_swallows_exception(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        bad_cm = MagicMock()
        bad_cm.__aenter__ = AsyncMock(side_effect=Exception("down"))
        bad_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", MagicMock(return_value=bad_cm)):
            asyncio.run(dag.complete_task("wf-1", "t-1", {}))  # must not raise


class TestFailTask:
    def test_posts_failed_status_with_reason(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            asyncio.run(dag.fail_task("wf-1", "cond-t-2", "timeout error"))

        body = mock_http.post.call_args[1]["json"]
        assert body["status"] == "FAILED"
        assert body["reasonFailed"] == "timeout error"
        assert body["taskId"] == "cond-t-2"

    def test_swallows_exception(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        bad_cm = MagicMock()
        bad_cm.__aenter__ = AsyncMock(side_effect=Exception("down"))
        bad_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", MagicMock(return_value=bad_cm)):
            asyncio.run(dag.fail_task("wf-1", "t-1", "boom"))  # must not raise


class TestPushEvent:
    def test_posts_to_events_endpoint(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))

        with patch("httpx.AsyncClient", _mock_httpx_cm(mock_http)):
            asyncio.run(dag.push_event("wf-1", "notification", {"message": "hi"}))

        url = mock_http.post.call_args[0][0]
        body = mock_http.post.call_args[1]["json"]
        assert "wf-1" in url
        assert body["type"] == "notification"
        assert body["message"] == "hi"

    def test_swallows_exception(self):
        dag = _AgentDagClient("http://server:8080", "k", "s")
        bad_cm = MagicMock()
        bad_cm.__aenter__ = AsyncMock(side_effect=Exception("down"))
        bad_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", MagicMock(return_value=bad_cm)):
            asyncio.run(dag.push_event("wf-1", "n", {}))  # must not raise
