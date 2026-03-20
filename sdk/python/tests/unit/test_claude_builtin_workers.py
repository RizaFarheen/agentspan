# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Tests for claude_builtin_workers — Tier 3 built-in tool workers."""

from unittest.mock import patch

import pytest

from agentspan.agents.frameworks.claude_builtin_workers import (
    _safe_path,
    claude_builtin_bash,
    claude_builtin_edit,
    claude_builtin_glob,
    claude_builtin_grep,
    claude_builtin_read,
    claude_builtin_webfetch,
    claude_builtin_websearch,
    claude_builtin_write,
)


class TestSafePath:
    def test_safe_path_within_cwd(self, tmp_path):
        result = _safe_path(str(tmp_path), "subdir/file.txt")
        assert str(result).startswith(str(tmp_path) + "/")

    def test_safe_path_traversal_raises(self, tmp_path):
        with pytest.raises(ValueError):
            _safe_path(str(tmp_path), "../escape.txt")

    def test_safe_path_absolute_within_cwd(self, tmp_path):
        # A relative path that stays within cwd should not raise
        result = _safe_path(str(tmp_path), "some/nested/path.py")
        assert str(result).startswith(str(tmp_path))


class TestClaudeBuiltinBash:
    def test_bash_runs_command(self):
        result = claude_builtin_bash("echo hello", cwd="/tmp")
        assert "hello" in result["output"]

    def test_bash_captures_stderr(self):
        result = claude_builtin_bash("echo err >&2", cwd="/tmp")
        assert "[stderr]:" in result["output"]
        assert "err" in result["output"]

    def test_bash_exit_code(self):
        result = claude_builtin_bash("exit 42", cwd="/tmp")
        assert result["exit_code"] == 42

    def test_bash_timeout(self):
        # Fast command, generous timeout — should succeed
        result = claude_builtin_bash("echo ok", timeout=30, cwd="/tmp")
        assert result["exit_code"] == 0
        assert "ok" in result["output"]


class TestClaudeBuiltinRead:
    def test_read_existing_file(self, tmp_path):
        f = tmp_path / "hello.txt"
        f.write_text("hello world\n")
        result = claude_builtin_read("hello.txt", cwd=str(tmp_path))
        assert "hello world" in result["output"]

    def test_read_file_not_found(self, tmp_path):
        result = claude_builtin_read("nonexistent.txt", cwd=str(tmp_path))
        assert "File not found" in result["output"]

    def test_read_traversal_blocked(self, tmp_path):
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        result = claude_builtin_read("../escape.txt", cwd=str(subdir))
        assert "exit_code" in result
        assert result["exit_code"] == 1


class TestClaudeBuiltinWrite:
    def test_write_creates_file(self, tmp_path):
        result = claude_builtin_write("test.txt", "hello", cwd=str(tmp_path))
        assert (tmp_path / "test.txt").exists()
        assert (tmp_path / "test.txt").read_text() == "hello"
        assert "Wrote" in result["output"]

    def test_write_creates_parent_dirs(self, tmp_path):
        claude_builtin_write("subdir/nested/file.txt", "content", cwd=str(tmp_path))
        assert (tmp_path / "subdir" / "nested" / "file.txt").exists()

    def test_write_traversal_blocked(self, tmp_path):
        result = claude_builtin_write("../escape.txt", "bad", cwd=str(tmp_path))
        assert result.get("exit_code") == 1


class TestClaudeBuiltinEdit:
    def test_edit_replaces_string(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("foo bar baz")
        result = claude_builtin_edit("code.py", "bar", "qux", cwd=str(tmp_path))
        assert f.read_text() == "foo qux baz"
        assert "Replaced" in result["output"]

    def test_edit_string_not_found(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("hello world")
        result = claude_builtin_edit("code.py", "missing", "new", cwd=str(tmp_path))
        assert result["exit_code"] == 1
        assert "not found" in result["output"]

    def test_edit_multiple_occurrences_requires_replace_all(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("foo foo foo")
        result = claude_builtin_edit("code.py", "foo", "bar", cwd=str(tmp_path))
        assert result["exit_code"] == 1
        assert "replace_all" in result["output"]

    def test_edit_replace_all_replaces_all(self, tmp_path):
        f = tmp_path / "code.py"
        f.write_text("foo foo foo")
        result = claude_builtin_edit("code.py", "foo", "bar", replace_all=True, cwd=str(tmp_path))
        assert f.read_text() == "bar bar bar"
        assert "3" in result["output"]


class TestClaudeBuiltinGlob:
    def test_glob_finds_files(self, tmp_path):
        (tmp_path / "a.py").write_text("pass")
        (tmp_path / "b.py").write_text("pass")
        result = claude_builtin_glob("*.py", cwd=str(tmp_path))
        assert result["count"] == 2
        assert "a.py" in result["output"]
        assert "b.py" in result["output"]

    def test_glob_empty_result(self, tmp_path):
        result = claude_builtin_glob("*.xyz", cwd=str(tmp_path))
        assert result["count"] == 0


class TestClaudeBuiltinGrep:
    def test_grep_finds_pattern(self, tmp_path):
        f = tmp_path / "sample.txt"
        f.write_text("hello world\ngoodbye\n")
        result = claude_builtin_grep("hello", cwd=str(tmp_path))
        assert result["count"] >= 1
        assert "hello" in result["output"]

    def test_grep_no_matches(self, tmp_path):
        f = tmp_path / "sample.txt"
        f.write_text("no match here\n")
        result = claude_builtin_grep("xyzzy_not_found_pattern", cwd=str(tmp_path))
        assert result["count"] == 0


class TestClaudeBuiltinWebsearch:
    def test_websearch_without_anthropic(self):
        with patch("agentspan.agents.frameworks.claude_builtin_workers._anthropic", None):
            result = claude_builtin_websearch("test query")
        assert "not installed" in result["output"]


class TestClaudeBuiltinWebfetch:
    def test_webfetch_without_anthropic(self):
        with patch("agentspan.agents.frameworks.claude_builtin_workers._anthropic", None):
            result = claude_builtin_webfetch("https://example.com")
        assert "not installed" in result["output"]
