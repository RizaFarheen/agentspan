.PHONY: test test-unit test-integration examples examples-all lint typecheck format all

all: lint typecheck test

test:
	python3 -m pytest tests/unit/ -v --cov --cov-report=term-missing

test-unit:
	python3 -m pytest tests/unit/ -v

test-integration:
	python3 -m pytest tests/integration/ -v

examples:
	@./scripts/run_examples.sh

examples-all:
	@./scripts/run_examples.sh --all

lint:
	ruff check src/

typecheck:
	mypy src/agentspan/agents/ --ignore-missing-imports --no-strict-optional

format:
	ruff format src/ tests/
