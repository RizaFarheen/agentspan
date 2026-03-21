"""Customer Engineering Support Agent.

Takes a Zendesk ticket number and investigates across Zendesk, JIRA, HubSpot,
Notion (runbooks), and GitHub to produce a solution with a priority rating.

Required environment variables:

    ZENDESK_SUBDOMAIN    – e.g. "mycompany"
    ZENDESK_EMAIL        – admin email for API auth
    ZENDESK_API_TOKEN    – Zendesk API token

    JIRA_BASE_URL        – e.g. "https://mycompany.atlassian.net"
    JIRA_EMAIL           – Atlassian account email
    JIRA_API_TOKEN       – Atlassian API token

    HUBSPOT_ACCESS_TOKEN – HubSpot private app access token

    NOTION_API_KEY       – Notion integration token
    NOTION_RUNBOOK_DB_ID – Database ID of the runbooks database in Notion

    GITHUB_TOKEN         – GitHub personal access token
    GITHUB_ORG           – GitHub organization name (e.g. "agentspan-dev")

    AGENT_LLM_MODEL      – (optional) LLM model, defaults to openai/gpt-4o-mini

Usage:

    python 70_ce_support_agent.py 12345          # ticket number
    python 70_ce_support_agent.py 12345 --stream  # with real-time events
"""

from __future__ import annotations

import json
import os
import sys
from typing import List, Optional

import requests
from pydantic import BaseModel, Field

from agentspan.agents import (
    Agent,
    AgentRuntime,
    Guardrail,
    OnFail,
    Position,
    RegexGuardrail,
    agent_tool,
    tool,
)

from settings import settings

# ---------------------------------------------------------------------------
# Structured output
# ---------------------------------------------------------------------------


class RelatedIssue(BaseModel):
    source: str = Field(description="Origin system: jira, github, or zendesk")
    key: str = Field(description="Issue key or URL")
    summary: str = Field(description="One-line summary")
    status: str = Field(description="Current status")


class TicketAnalysis(BaseModel):
    ticket_id: str = Field(description="Zendesk ticket ID")
    customer_name: str = Field(description="Customer / company name")
    summary: str = Field(description="One-paragraph summary of the customer issue")
    priority: str = Field(description="P0 (house on fire) | P1 (critical) | P2 (high) | P3 (medium) | P4 (low)")
    priority_justification: str = Field(description="Why this priority was assigned")
    root_cause: str = Field(description="Most likely root cause based on investigation")
    solution: str = Field(description="Recommended solution with step-by-step instructions")
    runbook_references: List[str] = Field(default_factory=list, description="Links or titles of relevant Notion runbooks")
    related_issues: List[RelatedIssue] = Field(default_factory=list, description="Related issues found across systems")
    code_references: List[str] = Field(default_factory=list, description="Relevant files, PRs, or commits in GitHub")
    next_steps: List[str] = Field(default_factory=list, description="Actionable next steps for the CE team")
    customer_tier: str = Field(default="unknown", description="Customer tier/plan from HubSpot")
    escalation_needed: bool = Field(default=False, description="Whether engineering escalation is needed")


# ---------------------------------------------------------------------------
# Zendesk tools
# ---------------------------------------------------------------------------

ZENDESK_SUBDOMAIN = os.environ.get("ZENDESK_SUBDOMAIN", "")
ZENDESK_EMAIL = os.environ.get("ZENDESK_EMAIL", "")
ZENDESK_API_TOKEN = os.environ.get("ZENDESK_API_TOKEN", "")


def _zendesk_headers() -> dict:
    return {"Content-Type": "application/json"}


def _zendesk_auth() -> tuple:
    return (f"{ZENDESK_EMAIL}/token", ZENDESK_API_TOKEN)


@tool
def get_zendesk_ticket(ticket_id: str) -> dict:
    """Fetch a Zendesk support ticket by its ID.

    Returns ticket subject, description, status, priority, tags,
    requester info, and recent comments.
    """
    url = f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets/{ticket_id}.json"
    resp = requests.get(url, auth=_zendesk_auth(), headers=_zendesk_headers(), timeout=15)
    resp.raise_for_status()
    ticket = resp.json()["ticket"]

    # Fetch comments for full conversation thread
    comments_url = f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets/{ticket_id}/comments.json"
    comments_resp = requests.get(comments_url, auth=_zendesk_auth(), headers=_zendesk_headers(), timeout=15)
    comments = []
    if comments_resp.ok:
        comments = [
            {"author_id": c["author_id"], "body": c["body"][:2000], "created_at": c["created_at"]}
            for c in comments_resp.json().get("comments", [])[-10:]  # last 10 comments
        ]

    # Fetch requester details
    requester = {}
    if ticket.get("requester_id"):
        user_url = f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/users/{ticket['requester_id']}.json"
        user_resp = requests.get(user_url, auth=_zendesk_auth(), headers=_zendesk_headers(), timeout=10)
        if user_resp.ok:
            u = user_resp.json()["user"]
            requester = {"name": u.get("name"), "email": u.get("email"), "organization_id": u.get("organization_id")}

    return {
        "id": ticket["id"],
        "subject": ticket.get("subject"),
        "description": ticket.get("description", "")[:3000],
        "status": ticket.get("status"),
        "priority": ticket.get("priority"),
        "tags": ticket.get("tags", []),
        "created_at": ticket.get("created_at"),
        "updated_at": ticket.get("updated_at"),
        "requester": requester,
        "comments": comments,
    }


@tool
def search_zendesk_tickets(query: str) -> dict:
    """Search Zendesk for tickets matching a query.

    Use this to find similar or related tickets from other customers.
    Returns up to 10 results.
    """
    url = f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/search.json"
    params = {"query": f"type:ticket {query}", "per_page": 10}
    resp = requests.get(url, auth=_zendesk_auth(), headers=_zendesk_headers(), params=params, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return {
        "count": len(results),
        "tickets": [
            {
                "id": t["id"],
                "subject": t.get("subject"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "created_at": t.get("created_at"),
                "description": (t.get("description") or "")[:500],
            }
            for t in results
        ],
    }


# ---------------------------------------------------------------------------
# JIRA tools
# ---------------------------------------------------------------------------

JIRA_BASE_URL = os.environ.get("JIRA_BASE_URL", "")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN", "")


def _jira_auth() -> tuple:
    return (JIRA_EMAIL, JIRA_API_TOKEN)


def _jira_headers() -> dict:
    return {"Accept": "application/json", "Content-Type": "application/json"}


@tool
def search_jira_issues(jql: str) -> dict:
    """Search JIRA issues using JQL (JIRA Query Language).

    Examples:
      - 'text ~ "timeout error" ORDER BY created DESC'
      - 'project = ENG AND labels = customer-reported'
      - 'summary ~ "auth" AND status != Done'

    Returns up to 15 matching issues with key, summary, status, assignee, and priority.
    """
    url = f"{JIRA_BASE_URL}/rest/api/3/search"
    payload = {"jql": jql, "maxResults": 15, "fields": ["summary", "status", "assignee", "priority", "labels", "created", "updated", "description"]}
    resp = requests.post(url, auth=_jira_auth(), headers=_jira_headers(), json=payload, timeout=15)
    resp.raise_for_status()
    issues = resp.json().get("issues", [])
    return {
        "total": resp.json().get("total", 0),
        "issues": [
            {
                "key": i["key"],
                "summary": i["fields"].get("summary"),
                "status": i["fields"].get("status", {}).get("name"),
                "priority": i["fields"].get("priority", {}).get("name"),
                "assignee": (i["fields"].get("assignee") or {}).get("displayName"),
                "labels": i["fields"].get("labels", []),
                "created": i["fields"].get("created"),
                "description": (i["fields"].get("description") or "")[:1000] if isinstance(i["fields"].get("description"), str) else "",
            }
            for i in issues
        ],
    }


@tool
def get_jira_issue(issue_key: str) -> dict:
    """Get full details of a specific JIRA issue by its key (e.g. ENG-1234).

    Returns summary, description, status, comments, and linked issues.
    """
    url = f"{JIRA_BASE_URL}/rest/api/3/issue/{issue_key}"
    params = {"fields": "summary,status,assignee,priority,labels,description,comment,issuelinks,created,updated,resolution"}
    resp = requests.get(url, auth=_jira_auth(), headers=_jira_headers(), params=params, timeout=15)
    resp.raise_for_status()
    issue = resp.json()
    fields = issue["fields"]

    comments = []
    for c in (fields.get("comment", {}).get("comments", []) or [])[-5:]:
        body = c.get("body", "")
        if isinstance(body, dict):
            # Atlassian Document Format — extract text nodes
            body = json.dumps(body)[:1000]
        comments.append({"author": c.get("author", {}).get("displayName"), "body": str(body)[:1000], "created": c.get("created")})

    links = []
    for link in fields.get("issuelinks", []):
        linked = link.get("outwardIssue") or link.get("inwardIssue")
        if linked:
            links.append({"key": linked["key"], "summary": linked["fields"].get("summary"), "type": link.get("type", {}).get("name")})

    desc = fields.get("description", "")
    if isinstance(desc, dict):
        desc = json.dumps(desc)[:2000]

    return {
        "key": issue["key"],
        "summary": fields.get("summary"),
        "status": fields.get("status", {}).get("name"),
        "priority": fields.get("priority", {}).get("name"),
        "assignee": (fields.get("assignee") or {}).get("displayName"),
        "labels": fields.get("labels", []),
        "resolution": (fields.get("resolution") or {}).get("name"),
        "description": str(desc)[:2000],
        "comments": comments,
        "linked_issues": links,
        "created": fields.get("created"),
        "updated": fields.get("updated"),
    }


# ---------------------------------------------------------------------------
# HubSpot tools
# ---------------------------------------------------------------------------

HUBSPOT_ACCESS_TOKEN = os.environ.get("HUBSPOT_ACCESS_TOKEN", "")


def _hubspot_headers() -> dict:
    return {"Authorization": f"Bearer {HUBSPOT_ACCESS_TOKEN}", "Content-Type": "application/json"}


@tool
def search_hubspot_company(company_name: str) -> dict:
    """Search HubSpot for a company by name.

    Returns company details including plan/tier, ARR, owner, and lifecycle stage.
    Useful for understanding customer context and importance.
    """
    url = "https://api.hubapi.com/crm/v3/objects/companies/search"
    payload = {
        "filterGroups": [{"filters": [{"propertyName": "name", "operator": "CONTAINS_TOKEN", "value": company_name}]}],
        "properties": ["name", "domain", "industry", "numberofemployees", "annualrevenue", "lifecyclestage",
                        "hs_lead_status", "hubspot_owner_id", "notes_last_contacted", "plan_tier",
                        "customer_tier", "contract_value", "subscription_type"],
        "limit": 5,
    }
    resp = requests.post(url, headers=_hubspot_headers(), json=payload, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return {
        "count": len(results),
        "companies": [
            {
                "id": r["id"],
                "name": r["properties"].get("name"),
                "domain": r["properties"].get("domain"),
                "industry": r["properties"].get("industry"),
                "employees": r["properties"].get("numberofemployees"),
                "annual_revenue": r["properties"].get("annualrevenue"),
                "lifecycle_stage": r["properties"].get("lifecyclestage"),
                "plan_tier": r["properties"].get("plan_tier") or r["properties"].get("customer_tier") or r["properties"].get("subscription_type"),
                "contract_value": r["properties"].get("contract_value"),
                "last_contacted": r["properties"].get("notes_last_contacted"),
            }
            for r in results
        ],
    }


@tool
def get_hubspot_contact(email: str) -> dict:
    """Look up a HubSpot contact by email address.

    Returns contact details, associated company, deal info, and recent activity.
    """
    url = f"https://api.hubapi.com/crm/v3/objects/contacts/{email}"
    params = {
        "idProperty": "email",
        "properties": "firstname,lastname,email,company,jobtitle,lifecyclestage,hs_lead_status,notes_last_contacted,hubspot_owner_id",
        "associations": "companies,deals",
    }
    resp = requests.get(url, headers=_hubspot_headers(), params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    props = data.get("properties", {})

    associations = {}
    for assoc_type, assoc_data in data.get("associations", {}).items():
        associations[assoc_type] = [{"id": a["id"], "type": a.get("type")} for a in assoc_data.get("results", [])]

    return {
        "id": data.get("id"),
        "name": f"{props.get('firstname', '')} {props.get('lastname', '')}".strip(),
        "email": props.get("email"),
        "company": props.get("company"),
        "job_title": props.get("jobtitle"),
        "lifecycle_stage": props.get("lifecyclestage"),
        "last_contacted": props.get("notes_last_contacted"),
        "associations": associations,
    }


# ---------------------------------------------------------------------------
# Notion tools (runbook search)
# ---------------------------------------------------------------------------

NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_RUNBOOK_DB_ID = os.environ.get("NOTION_RUNBOOK_DB_ID", "")


def _notion_headers() -> dict:
    return {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
    }


@tool
def search_notion_runbooks(query: str) -> dict:
    """Search Notion runbooks database for articles matching a query.

    Returns matching runbook titles, summaries, and page URLs.
    Use specific technical terms from the ticket for best results.
    """
    # Search the specific runbooks database
    url = f"https://api.notion.com/v1/databases/{NOTION_RUNBOOK_DB_ID}/query"
    payload: dict = {}
    if query:
        # Use Notion's filter for title property
        payload = {
            "filter": {
                "or": [
                    {"property": "title", "title": {"contains": query}},
                    {"property": "Name", "title": {"contains": query}},
                    {"property": "Tags", "multi_select": {"contains": query}},
                ]
            },
            "page_size": 10,
        }
    resp = requests.post(url, headers=_notion_headers(), json=payload, timeout=15)

    # Fallback to global search if database query fails
    if not resp.ok:
        search_url = "https://api.notion.com/v1/search"
        search_payload = {"query": query, "filter": {"value": "page", "property": "object"}, "page_size": 10}
        resp = requests.post(search_url, headers=_notion_headers(), json=search_payload, timeout=15)
        resp.raise_for_status()

    results = resp.json().get("results", [])
    pages = []
    for page in results:
        # Extract title from properties
        title = ""
        for prop_name, prop_val in page.get("properties", {}).items():
            if prop_val.get("type") == "title":
                title_parts = prop_val.get("title", [])
                title = "".join(t.get("plain_text", "") for t in title_parts)
                break

        pages.append({
            "id": page["id"],
            "title": title,
            "url": page.get("url", ""),
            "last_edited": page.get("last_edited_time"),
            "created": page.get("created_time"),
        })

    return {"count": len(pages), "runbooks": pages}


@tool
def get_notion_page_content(page_id: str) -> dict:
    """Retrieve the full content of a Notion page/runbook by its ID.

    Returns the page blocks as plain text for reading runbook instructions.
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    params = {"page_size": 100}
    resp = requests.get(url, headers=_notion_headers(), params=params, timeout=15)
    resp.raise_for_status()
    blocks = resp.json().get("results", [])

    content_parts = []
    for block in blocks:
        block_type = block.get("type", "")
        block_data = block.get(block_type, {})

        # Extract text from rich_text arrays
        if "rich_text" in block_data:
            text = "".join(rt.get("plain_text", "") for rt in block_data["rich_text"])
            if block_type.startswith("heading"):
                level = block_type[-1]  # heading_1 -> 1
                text = f"{'#' * int(level)} {text}"
            elif block_type == "bulleted_list_item":
                text = f"  - {text}"
            elif block_type == "numbered_list_item":
                text = f"  1. {text}"
            elif block_type == "to_do":
                checked = block_data.get("checked", False)
                text = f"  [{'x' if checked else ' '}] {text}"
            elif block_type == "code":
                lang = block_data.get("language", "")
                text = f"```{lang}\n{text}\n```"
            content_parts.append(text)
        elif block_type == "divider":
            content_parts.append("---")

    return {"page_id": page_id, "content": "\n".join(content_parts)[:5000]}


# ---------------------------------------------------------------------------
# GitHub tools
# ---------------------------------------------------------------------------

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_ORG = os.environ.get("GITHUB_ORG", "")


def _github_headers() -> dict:
    return {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}


@tool
def search_github_issues(query: str, repo: Optional[str] = None) -> dict:
    """Search GitHub issues and pull requests for matching terms.

    Args:
        query: Search terms (e.g. "timeout error", "auth flow bug").
        repo: Optional specific repo name (e.g. "backend"). If omitted, searches the whole org.

    Returns matching issues/PRs with title, state, labels, and URL.
    """
    search_query = query
    if repo:
        search_query += f" repo:{GITHUB_ORG}/{repo}"
    else:
        search_query += f" org:{GITHUB_ORG}"

    url = "https://api.github.com/search/issues"
    params = {"q": search_query, "per_page": 15, "sort": "updated", "order": "desc"}
    resp = requests.get(url, headers=_github_headers(), params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return {
        "total_count": resp.json().get("total_count", 0),
        "items": [
            {
                "number": i["number"],
                "title": i["title"],
                "state": i["state"],
                "html_url": i["html_url"],
                "is_pr": "pull_request" in i,
                "labels": [l["name"] for l in i.get("labels", [])],
                "created_at": i["created_at"],
                "updated_at": i["updated_at"],
                "body": (i.get("body") or "")[:500],
            }
            for i in items
        ],
    }


@tool
def search_github_code(query: str, repo: Optional[str] = None) -> dict:
    """Search GitHub code across the organization's repositories.

    Args:
        query: Code search terms (e.g. 'def handle_webhook', 'class AuthMiddleware').
        repo: Optional specific repo name to narrow search.

    Returns matching files with path, repo, and code snippet.
    """
    search_query = query
    if repo:
        search_query += f" repo:{GITHUB_ORG}/{repo}"
    else:
        search_query += f" org:{GITHUB_ORG}"

    url = "https://api.github.com/search/code"
    params = {"q": search_query, "per_page": 10}
    resp = requests.get(url, headers=_github_headers(), params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return {
        "total_count": resp.json().get("total_count", 0),
        "files": [
            {
                "name": i["name"],
                "path": i["path"],
                "repo": i["repository"]["full_name"],
                "html_url": i["html_url"],
                "score": i.get("score"),
            }
            for i in items
        ],
    }


@tool
def get_github_releases(repo: str, limit: int = 5) -> dict:
    """Get recent releases for a GitHub repository.

    Args:
        repo: Repository name (e.g. "backend", "sdk-python").
        limit: Number of releases to return (default 5).

    Returns release tags, names, dates, and changelogs.
    """
    url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo}/releases"
    params = {"per_page": limit}
    resp = requests.get(url, headers=_github_headers(), params=params, timeout=15)
    resp.raise_for_status()
    releases = resp.json()
    return {
        "repo": f"{GITHUB_ORG}/{repo}",
        "releases": [
            {
                "tag": r["tag_name"],
                "name": r.get("name"),
                "published_at": r.get("published_at"),
                "body": (r.get("body") or "")[:1000],
                "prerelease": r.get("prerelease", False),
                "html_url": r["html_url"],
            }
            for r in releases
        ],
    }


@tool
def get_github_pull_request(repo: str, pr_number: int) -> dict:
    """Get details of a specific GitHub pull request.

    Args:
        repo: Repository name (e.g. "backend").
        pr_number: Pull request number.

    Returns PR title, description, status, review state, and changed files.
    """
    url = f"https://api.github.com/repos/{GITHUB_ORG}/{repo}/pulls/{pr_number}"
    resp = requests.get(url, headers=_github_headers(), timeout=15)
    resp.raise_for_status()
    pr = resp.json()

    # Get changed files
    files_url = f"{url}/files"
    files_resp = requests.get(files_url, headers=_github_headers(), params={"per_page": 30}, timeout=15)
    changed_files = []
    if files_resp.ok:
        changed_files = [
            {"filename": f["filename"], "status": f["status"], "additions": f["additions"], "deletions": f["deletions"]}
            for f in files_resp.json()
        ]

    return {
        "number": pr["number"],
        "title": pr["title"],
        "state": pr["state"],
        "merged": pr.get("merged", False),
        "html_url": pr["html_url"],
        "body": (pr.get("body") or "")[:2000],
        "created_at": pr["created_at"],
        "merged_at": pr.get("merged_at"),
        "head_branch": pr["head"]["ref"],
        "base_branch": pr["base"]["ref"],
        "changed_files_count": pr.get("changed_files", 0),
        "changed_files": changed_files[:20],
    }


# ---------------------------------------------------------------------------
# PII guardrail — prevent leaking sensitive customer data in output
# ---------------------------------------------------------------------------

pii_guardrail = RegexGuardrail(
    patterns=[
        r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",  # credit card
        r"\b\d{3}-\d{2}-\d{4}\b",                          # SSN
    ],
    mode="block",
    position="output",
    on_fail="retry",
    message="Do not include credit card numbers or SSNs in the output. Redact any PII.",
)


# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

# -- Specialist: Zendesk investigator --
zendesk_agent = Agent(
    name="zendesk_investigator",
    model=settings.llm_model,
    instructions="""\
You are a Zendesk specialist. Your job is to:
1. Fetch the given ticket and extract the core customer issue
2. Search for similar/related tickets to identify patterns (e.g. is this a recurring issue?)
3. Note the ticket's current status, priority, tags, and requester info

Return a structured summary covering:
- What the customer is experiencing (in their words and technical terms)
- Any error messages, screenshots, or logs mentioned
- How many other customers have reported similar issues
- The customer's email and organization for cross-referencing in other systems
""",
    tools=[get_zendesk_ticket, search_zendesk_tickets],
)

# -- Specialist: JIRA investigator --
jira_agent = Agent(
    name="jira_investigator",
    model=settings.llm_model,
    instructions="""\
You are a JIRA specialist. Given a description of a customer issue:
1. Search for related engineering tickets (bugs, feature requests, known issues)
2. Check if there's an existing fix in progress or already shipped
3. Look for related incidents or post-mortems

Use JQL queries like:
- text ~ "keyword" for full-text search
- labels = "customer-reported" for customer-facing issues
- status in ("In Progress", "In Review") for active work

Summarize what engineering knows about this issue and whether a fix exists.
""",
    tools=[search_jira_issues, get_jira_issue],
)

# -- Specialist: HubSpot investigator --
hubspot_agent = Agent(
    name="hubspot_investigator",
    model=settings.llm_model,
    instructions="""\
You are a HubSpot CRM specialist. Given a customer name or email:
1. Look up the company to understand their tier, plan, revenue, and importance
2. Look up the contact to see recent interactions and ownership

This context is critical for prioritization:
- Enterprise/high-revenue customers with production issues = higher priority
- Free tier users with feature requests = lower priority

Return the customer's plan tier, ARR/contract value, lifecycle stage, and account owner.
""",
    tools=[search_hubspot_company, get_hubspot_contact],
)

# -- Specialist: Notion runbook searcher --
runbook_agent = Agent(
    name="runbook_searcher",
    model=settings.llm_model,
    instructions="""\
You are a Notion runbook specialist. Given a technical issue description:
1. Search for runbooks that match the symptoms or error type
2. Read the most relevant runbook(s) to find step-by-step resolution instructions
3. Note any prerequisites, caveats, or escalation criteria from the runbooks

If you find a matching runbook, extract the key resolution steps.
If no runbook exists, say so — this is valuable info for the team (we need to create one).
""",
    tools=[search_notion_runbooks, get_notion_page_content],
)

# -- Specialist: GitHub code investigator --
github_agent = Agent(
    name="github_investigator",
    model=settings.llm_model,
    instructions="""\
You are a GitHub code specialist. Given a technical issue description:
1. Search for related issues and PRs that might contain fixes or discussions
2. Search the codebase for relevant code (error messages, function names, config)
3. Check recent releases to see if a fix was shipped or if a regression was introduced

Focus on:
- Open issues with the same symptoms
- Recently merged PRs that might have introduced the bug
- Release notes mentioning relevant fixes
- Code paths that could be involved

Return relevant PRs, issues, code locations, and release versions.
""",
    tools=[search_github_issues, search_github_code, get_github_releases, get_github_pull_request],
)


# -- Main orchestrator agent --
ORCHESTRATOR_INSTRUCTIONS = """\
You are a Customer Engineering Support Agent. Your job is to investigate a Zendesk \
support ticket and deliver a comprehensive analysis with a prioritized solution.

WORKFLOW:
1. First, use the zendesk_investigator to fetch the ticket and find related tickets
2. In PARALLEL, use the other investigators to gather context:
   - hubspot_investigator: Look up the customer's tier and revenue (use the requester email or company name from the ticket)
   - jira_investigator: Search for related engineering issues using key terms from the ticket
   - runbook_searcher: Search for applicable runbooks using technical terms from the ticket
   - github_investigator: Search for related issues, PRs, and code using technical terms from the ticket
3. Synthesize all findings into a solution

PRIORITY GUIDE:
- P0 (House on fire): Production down for enterprise customer, data loss, security breach, complete service outage
- P1 (Critical): Major feature broken for high-tier customer, significant revenue impact, partial outage
- P2 (High): Important feature degraded, workaround exists but painful, multiple customers affected
- P3 (Medium): Non-critical feature issue, minor inconvenience, single customer affected, has workaround
- P4 (Low): Enhancement request, cosmetic issue, documentation question, general inquiry

PRIORITY MODIFIERS:
- Customer on enterprise/high-revenue plan → bump priority up by 1 level
- Multiple customers reporting same issue → bump priority up by 1 level
- Issue has a known workaround → may lower urgency but not priority
- Security-related → minimum P1

Provide a clear, actionable solution with step-by-step instructions the CE team can follow.
If engineering escalation is needed, explain exactly what needs to happen and why.
"""

ce_support_agent = Agent(
    name="ce_support_agent",
    model=settings.llm_model,
    instructions=ORCHESTRATOR_INSTRUCTIONS,
    tools=[
        agent_tool(zendesk_agent, description="Investigate the Zendesk ticket — fetch details and find related tickets"),
        agent_tool(hubspot_agent, description="Look up customer context in HubSpot — plan tier, revenue, importance"),
        agent_tool(jira_agent, description="Search JIRA for related engineering issues, bugs, and fixes"),
        agent_tool(runbook_agent, description="Search Notion runbooks for resolution procedures"),
        agent_tool(github_agent, description="Search GitHub for related issues, PRs, code, and releases"),
    ],
    output_type=TicketAnalysis,
    guardrails=[pii_guardrail],
    max_turns=15,
    temperature=0.2,
)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    if len(sys.argv) < 2:
        print("Usage: python 70_ce_support_agent.py <ticket_id> [--stream]")
        print("Example: python 70_ce_support_agent.py 12345")
        sys.exit(1)

    ticket_id = sys.argv[1]
    use_stream = "--stream" in sys.argv

    prompt = f"Investigate Zendesk ticket #{ticket_id} and provide a full analysis with solution and priority."

    with AgentRuntime() as runtime:
        if use_stream:
            print(f"\n--- Investigating ticket #{ticket_id} (streaming) ---\n")
            for event in runtime.stream(ce_support_agent, prompt):
                if event.type == "tool_call":
                    print(f"  [{event.tool_name}] calling...")
                elif event.type == "tool_result":
                    print(f"  [{event.tool_name}] done")
                elif event.type == "handoff":
                    print(f"  -> handing off to {event.target}")
                elif event.type == "error":
                    print(f"  ERROR: {event.content}")
                elif event.type == "done":
                    analysis = event.output
                    _print_analysis(analysis)
        else:
            print(f"\n--- Investigating ticket #{ticket_id} ---\n")
            result = runtime.run(ce_support_agent, prompt)
            _print_analysis(result.output)
            print(f"\nTokens used: {result.token_usage.total_tokens}")


def _print_analysis(analysis: TicketAnalysis):
    """Pretty-print the ticket analysis."""
    print("=" * 70)
    print(f"  TICKET ANALYSIS: #{analysis.ticket_id}")
    print(f"  CUSTOMER: {analysis.customer_name} ({analysis.customer_tier})")
    print(f"  PRIORITY: {analysis.priority}")
    print(f"  ESCALATION NEEDED: {'YES' if analysis.escalation_needed else 'No'}")
    print("=" * 70)

    print(f"\nSUMMARY:\n  {analysis.summary}")
    print(f"\nPRIORITY JUSTIFICATION:\n  {analysis.priority_justification}")
    print(f"\nROOT CAUSE:\n  {analysis.root_cause}")
    print(f"\nSOLUTION:\n  {analysis.solution}")

    if analysis.runbook_references:
        print("\nRUNBOOK REFERENCES:")
        for ref in analysis.runbook_references:
            print(f"  - {ref}")

    if analysis.related_issues:
        print("\nRELATED ISSUES:")
        for issue in analysis.related_issues:
            print(f"  [{issue.source}] {issue.key}: {issue.summary} ({issue.status})")

    if analysis.code_references:
        print("\nCODE REFERENCES:")
        for ref in analysis.code_references:
            print(f"  - {ref}")

    if analysis.next_steps:
        print("\nNEXT STEPS:")
        for i, step in enumerate(analysis.next_steps, 1):
            print(f"  {i}. {step}")

    print()


if __name__ == "__main__":
    main()
