"""Tests for Python SDK packaging metadata."""

from __future__ import annotations

from pathlib import Path


def test_base_dependencies_include_pyyaml_for_public_agents_import():
    """Public agents import path loads skill.py, which depends on PyYAML."""
    pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
    content = pyproject.read_text()
    assert '"PyYAML>=6.0"' in content
