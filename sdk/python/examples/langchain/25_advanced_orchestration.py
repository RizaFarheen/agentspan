# Copyright (c) 2025 Agentspan
# Licensed under the MIT License. See LICENSE file in the project root for details.

"""Advanced Orchestration — orchestrator dispatching to specialist sub-agents as sub-workflows.

Demonstrates:
    - A pipeline orchestrator that decomposes a business report task into specialist sub-agents
    - Each specialist is a create_agent() graph compiled as a SUB_WORKFLOW
    - Every agent runs as its own Conductor workflow with its own execution ID
    - Practical use case: automated business report generation from raw data inputs

Requirements:
    - AGENTSPAN_SERVER_URL=http://localhost:8080/api
    - OPENAI_API_KEY for ChatOpenAI
"""

from agentspan.agents.langchain import create_agent
from langchain_openai import ChatOpenAI
from agentspan.agents import AgentRuntime

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


# ── Specialist sub-agents (each compiles as a SUB_WORKFLOW) ───────────────────

market_analyst = create_agent(
    llm,
    name="analyze_market_data",
    system_prompt=(
        "You are a market analyst. When given a company and sector, provide a concise "
        "market analysis in 3-4 sentences covering position, trends, and competition."
    ),
)

financial_analyst = create_agent(
    llm,
    name="generate_financial_metrics",
    system_prompt=(
        "You are a financial analyst. When given company financials (revenue, growth rate), "
        "interpret the metrics and derive 4-5 key insights including valuation implications."
    ),
)

risk_analyst = create_agent(
    llm,
    name="assess_risks",
    system_prompt=(
        "You are a risk analyst. When given a company, sector, and growth rate, "
        "identify the top 4-5 specific risks considering sector dynamics and growth trajectory."
    ),
)

report_compiler = create_agent(
    llm,
    name="compile_report",
    system_prompt=(
        "You are a business consultant. When given market analysis, financial metrics, "
        "and risk assessment for a company, compile them into a structured executive report "
        "with: executive summary, key findings per section, 3-5 recommendations, and key risks."
    ),
)


# ── Orchestrator agent ────────────────────────────────────────────────────────

graph = create_agent(
    llm,
    tools=[market_analyst, financial_analyst, risk_analyst, report_compiler],
    name="advanced_orchestration_agent",
    system_prompt=(
        "You are a senior business intelligence orchestrator.\n"
        "For each company analysis request:\n"
        "1. Call analyze_market_data with the company name and sector\n"
        "2. Call generate_financial_metrics with the company name, revenue, and growth rate\n"
        "3. Call assess_risks with the company name, sector, and growth rate\n"
        "4. Call compile_report with all findings to produce the final executive report\n"
        "Always call all four specialists and return the compiled report."
    ),
)

if __name__ == "__main__":
    with AgentRuntime() as runtime:
        result = runtime.run(
            graph,
            "Generate a complete executive report for TechStartup Inc., "
            "a SaaS company in the cloud infrastructure sector with $12M annual revenue "
            "and 45% year-over-year growth.",
        )
        print(f"Status: {result.status}")
        result.print_result()
