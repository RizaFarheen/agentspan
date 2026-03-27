# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""CLI entry point for agent discovery. Called by the Go CLI."""

import argparse
import json
import sys

from agentspan.agents.runtime.discovery import discover_agents
from agentspan.agents.frameworks.serializer import detect_framework


def main():
    parser = argparse.ArgumentParser(description="Discover agents in a Python package")
    parser.add_argument("--package", required=True, help="Dotted Python package name to scan")
    args = parser.parse_args()

    try:
        agents = discover_agents([args.package])
    except Exception as e:
        print(f"Discovery failed: {e}", file=sys.stderr)
        sys.exit(1)

    result = [
        {"name": a.name, "framework": detect_framework(a) or "native"}
        for a in agents
    ]
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
