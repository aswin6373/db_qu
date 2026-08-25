"""QueryMind's data-analysis agent: an LLM loop with tools.

Unlike the one-shot pipeline, the agent decides its own steps — inspect the
schema, run SELECT queries, read errors and self-correct — until it can answer.
Read-only by design: writes keep flowing through the confirm-gated pipeline.
"""

import json
import re
from dataclasses import dataclass, field

import httpx

from app.services.ai import (
    AIConfig,
    _effective_ai,
    _gemini_generate,
    _history_block,
    _ollama_generate,
    _openai_generate,
)
from app.services.sql_validator import validate_sql

MAX_STEPS = 8
MAX_QUERIES = 5
PREVIEW_ROWS = 15
CELL_LIMIT = 60


class AgentError(Exception):
    """The agent could not complete; caller should fall back to the pipeline."""


class AgentUnavailableError(AgentError):
    """The configured provider cannot drive an agent loop."""


@dataclass
class AgentResult:
    summary: str
    sql: str
    columns: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    steps: list = field(default_factory=list)


def agent_supported(ai_config: AIConfig | None) -> bool:
    return _effective_ai(ai_config).provider in {"gemini", "openai", "ollama"}


def run_agent(
    question: str,
    schema: dict,
    execute_sql,
    history: list[dict] | None = None,
    ai_config: AIConfig | None = None,
) -> AgentResult:
    """Run the agent loop. `execute_sql(sql)` must return (columns, rows) and is
    only ever called with validated SELECT statements."""
    eff = _effective_ai(ai_config)
    if eff.provider not in {"gemini", "openai", "ollama"}:
        raise AgentUnavailableError(f"Agent mode is not available for provider '{eff.provider}'")

    steps: list[dict] = []
    observations: list[str] = []
    queries_run = 0
    last_result: tuple | None = None  # (columns, rows, sql)

    for _ in range(MAX_STEPS):
        prompt = _agent_prompt(question, schema, observations, history, queries_run)
        raw = _agent_generate(prompt, eff)
        action = _parse_action(raw)
        if action is None:
            raise AgentError("The AI agent returned an unreadable response.")

        tool = str(action.get("tool", "")).strip().lower()
        tool_input = str(action.get("input", "") or "").strip()

        if tool == "finish":
            summary = str(action.get("summary", "") or "").strip()
            if not summary:
                raise AgentError("The AI agent finished without an answer.")
            final_sql = str(action.get("sql", "") or "").strip()
            columns, rows = (last_result[0], last_result[1]) if last_result else ([], [])
            steps.append({
                "tool": "finish",
                "label": "Wrote the final answer",
                "detail": summary[:140],
            })
            return AgentResult(
                summary=summary,
                sql=final_sql or (last_result[2] if last_result else ""),
                columns=columns,
                rows=rows,
                steps=steps,
            )

        if tool == "list_tables":
            names = ", ".join((schema.get("tables") or {}).keys()) or "none"
            steps.append({"tool": tool, "label": "Checked the tables in your database", "detail": names})
            observations.append(f"list_tables -> {names}")

        elif tool == "get_columns":
            table = tool_input.strip("`\"' ")
            columns_meta = (schema.get("tables") or {}).get(table, {}).get("columns", []) or []
            if columns_meta:
                detail = ", ".join(f"{c.get('name')} ({c.get('type', '')})" for c in columns_meta)
                steps.append({"tool": tool, "label": f"Inspected columns of `{table}`", "detail": detail})
                observations.append(f"get_columns({table}) -> {detail}")
            else:
                available = ", ".join((schema.get("tables") or {}).keys())
                detail = f"Unknown table '{table}'. Available tables: {available}"
                steps.append({"tool": tool, "label": f"Tried to inspect `{table}`", "detail": detail, "error": True})
                observations.append(f"get_columns({table}) -> ERROR: {detail}")

        elif tool == "run_sql":
            if queries_run >= MAX_QUERIES:
                detail = f"Only {MAX_QUERIES} queries are allowed per question — call finish with what you have."
                steps.append({"tool": tool, "label": "Query limit reached", "detail": detail, "error": True})
                observations.append(f"run_sql -> BLOCKED: {detail}")
                # Don't burn the remaining (potentially slow) steps on blocked
                # calls: finish with whatever evidence exists.
                return _forced_finish(question, schema, observations, history, queries_run, eff, steps, last_result)

            sql = tool_input
            validation = validate_sql(sql, schema)
            if not validation.ok:
                steps.append({"tool": tool, "label": "SQL failed validation", "sql": sql, "detail": validation.error, "error": True})
                observations.append(f"run_sql -> ERROR: {validation.error}\nSQL: {sql}")
                continue
            if validation.requires_confirmation or validation.query_type.lower() != "select":
                message = "Only SELECT queries are allowed in analysis mode."
                steps.append({"tool": tool, "label": "Write query blocked", "sql": sql, "detail": message, "error": True})
                observations.append(f"run_sql -> BLOCKED: {message}")
                continue

            try:
                columns, rows = execute_sql(sql)
            except Exception as exc:  # noqa: BLE001 — errors feed the agent's self-correction
                steps.append({"tool": tool, "label": "Query failed", "sql": sql, "detail": str(exc)[:300], "error": True})
                observations.append(f"run_sql -> ERROR: {exc}\nSQL: {sql}")
                continue

            queries_run += 1
            last_result = (columns, rows, sql)
            preview = _preview(columns, rows)
            steps.append({"tool": tool, "label": f"Ran a query ({len(rows)} rows)", "sql": sql, "detail": preview})
            observations.append(f"run_sql -> OK ({len(rows)} rows)\nSQL: {sql}\n{preview}")

        else:
            steps.append({"tool": tool or "unknown", "label": "Unknown action", "detail": f"'{tool}' is not a tool.", "error": True})
            observations.append(f"unknown tool '{tool}' — use list_tables, get_columns, run_sql, or finish")

    raise AgentError("The agent used all its steps without reaching a final answer.")


def _forced_finish(
    question: str,
    schema: dict,
    observations: list[str],
    history: list[dict] | None,
    queries_run: int,
    eff,
    steps: list,
    last_result: tuple | None,
) -> AgentResult:
    """Query budget exhausted: one final LLM call asks for the answer based on
    evidence so far; if that fails, return the raw last result."""
    try:
        prompt = (
            "You have used your full query budget. Based ONLY on the observations "
            f"below, answer the user's question in 1-3 clear sentences.\n\n"
            f"User question: {question}\n\nObservations:\n"
            + "\n".join(observations[-6:])
        )
        summary = _agent_generate(prompt, eff).strip() or f"Gathered results from {queries_run} quer{'y' if queries_run == 1 else 'ies'}."
    except (RuntimeError, httpx.HTTPError):
        summary = f"Gathered results from {queries_run} queries before hitting the query limit."
    columns, rows = (last_result[0], last_result[1]) if last_result else ([], [])
    steps.append({
        "tool": "finish",
        "label": "Wrote the final answer (query limit reached)",
        "detail": summary[:140],
    })
    return AgentResult(
        summary=summary,
        sql=(last_result[2] if last_result else ""),
        columns=columns,
        rows=rows,
        steps=steps,
    )


def _agent_generate(prompt: str, eff) -> str:
    if eff.provider == "gemini":
        return _gemini_generate(prompt, eff)
    if eff.provider == "openai":
        return _openai_generate(prompt, eff)
    if eff.provider == "ollama":
        return _ollama_generate(prompt, eff)
    raise AgentUnavailableError(f"Agent mode is not available for provider '{eff.provider}'")


def _parse_action(raw: str) -> dict | None:
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE)
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("action"), dict):
        return data["action"]
    if data.get("tool"):
        return data
    return None


def _preview(columns: list, rows: list) -> str:
    lines = [", ".join(str(column) for column in columns)]
    for row in rows[:PREVIEW_ROWS]:
        lines.append(", ".join(str(row.get(column, ""))[:CELL_LIMIT] for column in columns))
    if len(rows) > PREVIEW_ROWS:
        lines.append(f"... ({len(rows)} rows total)")
    return "\n".join(lines)


def _agent_prompt(
    question: str,
    schema: dict,
    observations: list[str],
    history: list[dict] | None,
    queries_run: int,
) -> str:
    obs = "\n\n".join(observations) if observations else "(none yet — this is your first step)"
    return f"""
You are QueryMind's data-analysis agent working with a MySQL database.

Answer the user's question step by step. You can only act through tools, and each
reply must be EXACTLY ONE JSON object with no other text:

{{"action": {{"tool": "list_tables", "input": ""}}}}
{{"action": {{"tool": "get_columns", "input": "<exact table name>"}}}}
{{"action": {{"tool": "run_sql", "input": "<one SELECT statement>"}}}}
{{"action": {{"tool": "finish", "sql": "<the main SELECT that produced your answer, or empty string>", "summary": "<your final answer, 1-3 clear human sentences>"}}}}

RULES:
- READ-ONLY: run_sql accepts SELECT only — never INSERT/UPDATE/DELETE/ALTER/DROP.
- Use only tables and columns from the schema below. Never guess names; inspect with get_columns first when unsure.
- You may run at most {MAX_QUERIES} queries ({queries_run} used so far). Add LIMIT when exploring.
- If a query returns an error, read the error, fix the SQL, and try again.
- Multi-step thinking is encouraged: explore, verify assumptions, then answer.
- When you have enough information, ALWAYS call finish with a direct, human answer.

{_history_block(history)}

Schema:
{json.dumps(schema, indent=2)}

User question: {question}

Steps so far:
{obs}

Your next action (JSON only):""".strip()
