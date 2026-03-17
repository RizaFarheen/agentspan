# Claude Code Instructions

## Python

- Use `uv` for all package management — never `pip`. Use `uv run` to execute scripts, `uv add` to add deps.
- Use `dataclasses` for models and config. Use `os.environ.get()` for env var loading.
- Pydantic is NOT a dependency — only use when required by external frameworks (e.g., OpenAI structured output).
- Config classes use `from_env()` classmethod pattern (see `AgentConfig`).
- Format with `ruff format`, lint with `ruff check`.

## Plans

- Always break plans into multiple stages.
- Validation/verification is a separate stage that comes BEFORE documentation.
- Documentation updates are a separate final stage.

## Native Execution

- Native mode runs examples directly via provider SDK (no server needed)
- Shim: `uv run python3 -m validation.native.shim <example_script.py>`

## Reference

- SDK API docs: `AGENTS.md`
- Design docs: `docs/`
