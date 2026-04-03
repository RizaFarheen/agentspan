"""Shared utilities for production showcase agents.

Provides:
- Mode detection (dry-run vs live)
- Model & server config
- Workspace management with guaranteed cleanup
- Repo ecosystem detection with deterministic profiles
- Credential helpers
"""

from __future__ import annotations

import atexit
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

# ── Mode & Config ──────────────────────────────────────────────────


def is_dry_run() -> bool:
    return os.environ.get("AGENTSPAN_DRY_RUN", "false").lower() in ("true", "1", "yes")


def get_model() -> str:
    return os.environ.get(
        "AGENTSPAN_AGENT_MODEL",
        os.environ.get("AGENTSPAN_LLM_MODEL", "openai/gpt-4o"),
    )


def get_server_url() -> str:
    raw = os.environ.get("AGENTSPAN_SERVER_URL", "http://localhost:8991/api").rstrip(
        "/"
    )
    parsed = urlsplit(raw)
    if not parsed.scheme or not parsed.netloc:
        return raw
    if parsed.path in ("", "/"):
        parsed = parsed._replace(path="/api")
    return urlunsplit(parsed)


def is_draft_pr() -> bool:
    return os.environ.get("AGENTSPAN_DRAFT_PR", "true").lower() != "false"


# ── Workspace Management ──────────────────────────────────────────

_workspaces: list[str] = []


def create_workspace(prefix: str = "agentspan_") -> str:
    """Create a temp directory registered for cleanup on exit."""
    workdir = tempfile.mkdtemp(prefix=prefix)
    _workspaces.append(workdir)
    return workdir


def cleanup_workspace(workdir: str) -> None:
    """Remove a specific workspace."""
    try:
        shutil.rmtree(workdir, ignore_errors=True)
    except Exception:
        pass
    if workdir in _workspaces:
        _workspaces.remove(workdir)


def cleanup_all_workspaces() -> None:
    """Remove all registered workspaces."""
    for ws in list(_workspaces):
        cleanup_workspace(ws)


atexit.register(cleanup_all_workspaces)


# ── Repo Ecosystem Profiles ───────────────────────────────────────


@dataclass
class RepoProfile:
    """Deterministic test/lint/build commands for a detected ecosystem."""

    languages: list[str] = field(default_factory=list)
    test_cmd: Optional[str] = None
    lint_cmd: Optional[str] = None
    build_cmd: Optional[str] = None
    package_manager: Optional[str] = None
    has_ci: bool = False

    def to_dict(self) -> dict:
        return {
            "languages": self.languages,
            "test_cmd": self.test_cmd,
            "lint_cmd": self.lint_cmd,
            "build_cmd": self.build_cmd,
            "package_manager": self.package_manager,
            "has_ci": self.has_ci,
        }

    @classmethod
    def detect(cls, workdir: str) -> RepoProfile:
        """Detect repo ecosystem from config files.

        Uses a priority-ordered cascade of config file checks.
        Every branch produces a deterministic result — no guessing.
        """
        profile = cls()

        # ── Python ─────────────────────────────────────────────
        has_pyproject = os.path.exists(f"{workdir}/pyproject.toml")
        has_setup_py = os.path.exists(f"{workdir}/setup.py")
        has_setup_cfg = os.path.exists(f"{workdir}/setup.cfg")

        if has_pyproject or has_setup_py or has_setup_cfg:
            profile.languages.append("python")

            # Detect package manager
            if os.path.exists(f"{workdir}/uv.lock"):
                profile.package_manager = "uv"
            elif os.path.exists(f"{workdir}/poetry.lock"):
                profile.package_manager = "poetry"
            elif os.path.exists(f"{workdir}/Pipfile.lock"):
                profile.package_manager = "pipenv"
            else:
                profile.package_manager = "pip"

            # Test command — check pyproject.toml for framework hints
            if has_pyproject:
                try:
                    with open(f"{workdir}/pyproject.toml", errors="replace") as f:
                        content = f.read()
                except OSError:
                    content = ""

                if "[tool.pytest" in content or "pytest" in content:
                    profile.test_cmd = "python -m pytest -x -q --tb=short"
                elif "unittest" in content:
                    profile.test_cmd = "python -m unittest discover -s tests"

                if "ruff" in content:
                    profile.lint_cmd = "ruff check ."
                elif "flake8" in content:
                    profile.lint_cmd = "flake8 ."
                elif "pylint" in content:
                    profile.lint_cmd = "pylint src/"

            # Fallbacks based on directory structure
            if not profile.test_cmd:
                if os.path.exists(f"{workdir}/tests") or os.path.exists(
                    f"{workdir}/test"
                ):
                    profile.test_cmd = "python -m pytest -x -q --tb=short"

            if not profile.lint_cmd:
                profile.lint_cmd = (
                    "ruff check . 2>/dev/null || flake8 . 2>/dev/null || true"
                )

        # ── JavaScript / TypeScript ────────────────────────────
        has_package_json = os.path.exists(f"{workdir}/package.json")

        if has_package_json:
            profile.languages.append("javascript")

            # Detect package manager
            if os.path.exists(f"{workdir}/pnpm-lock.yaml"):
                profile.package_manager = profile.package_manager or "pnpm"
                pm = "pnpm"
            elif os.path.exists(f"{workdir}/yarn.lock"):
                profile.package_manager = profile.package_manager or "yarn"
                pm = "yarn"
            elif os.path.exists(f"{workdir}/bun.lockb"):
                profile.package_manager = profile.package_manager or "bun"
                pm = "bun"
            else:
                profile.package_manager = profile.package_manager or "npm"
                pm = "npm"

            # Read package.json scripts
            try:
                with open(f"{workdir}/package.json") as f:
                    pkg = json.load(f)
            except (json.JSONDecodeError, OSError):
                pkg = {}

            scripts = pkg.get("scripts", {})
            if "test" in scripts:
                profile.test_cmd = profile.test_cmd or f"{pm} test"
            if "lint" in scripts:
                profile.lint_cmd = profile.lint_cmd or f"{pm} run lint"
            if "build" in scripts:
                profile.build_cmd = f"{pm} run build"

            # TypeScript detection
            if os.path.exists(f"{workdir}/tsconfig.json"):
                if "typescript" not in profile.languages:
                    profile.languages.append("typescript")

        # ── Go ─────────────────────────────────────────────────
        if os.path.exists(f"{workdir}/go.mod"):
            profile.languages.append("go")
            profile.test_cmd = profile.test_cmd or "go test ./..."
            profile.lint_cmd = (
                profile.lint_cmd or "golangci-lint run 2>/dev/null || go vet ./..."
            )

        # ── Rust ───────────────────────────────────────────────
        if os.path.exists(f"{workdir}/Cargo.toml"):
            profile.languages.append("rust")
            profile.test_cmd = profile.test_cmd or "cargo test"
            profile.lint_cmd = profile.lint_cmd or "cargo clippy"
            profile.build_cmd = profile.build_cmd or "cargo build"

        # ── Ruby ───────────────────────────────────────────────
        if os.path.exists(f"{workdir}/Gemfile"):
            profile.languages.append("ruby")
            if os.path.exists(f"{workdir}/Rakefile"):
                profile.test_cmd = profile.test_cmd or "bundle exec rake test"
            elif os.path.exists(f"{workdir}/spec"):
                profile.test_cmd = profile.test_cmd or "bundle exec rspec"

        # ── Java ───────────────────────────────────────────────
        if os.path.exists(f"{workdir}/pom.xml"):
            profile.languages.append("java")
            profile.test_cmd = profile.test_cmd or "mvn test -q"
        elif os.path.exists(f"{workdir}/build.gradle") or os.path.exists(
            f"{workdir}/build.gradle.kts"
        ):
            profile.languages.append("java")
            profile.test_cmd = profile.test_cmd or "./gradlew test"

        # ── CI detection ───────────────────────────────────────
        ci_indicators = [
            f"{workdir}/.github/workflows",
            f"{workdir}/.circleci",
            f"{workdir}/.travis.yml",
            f"{workdir}/Jenkinsfile",
            f"{workdir}/.gitlab-ci.yml",
        ]
        profile.has_ci = any(os.path.exists(p) for p in ci_indicators)

        # ── Deterministic fallback ─────────────────────────────
        # If we detected languages but no test command, that's a valid state.
        # Don't guess. The agent instructions handle "no test_cmd" explicitly.

        return profile


# ── Shell Helpers ──────────────────────────────────────────────────


def run_cmd(
    cmd: list[str],
    *,
    cwd: Optional[str] = None,
    env: Optional[dict[str, str]] = None,
    timeout: int = 60,
    check: bool = False,
) -> subprocess.CompletedProcess:
    """Run a command with consistent timeout and encoding."""
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def gh_api(endpoint: str, *, timeout: int = 15) -> dict:
    """Call the GitHub API via gh CLI."""
    r = run_cmd(["gh", "api", endpoint], timeout=timeout)
    if r.returncode != 0:
        return {"error": r.stderr[:500]}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"error": "Invalid JSON", "raw": r.stdout[:500]}
