import json
import logging
import re
import time
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.services.sql_validator import validate_sql

logger = logging.getLogger("querymind")


class QueryUnderstandingError(ValueError):
    pass


class SchemaAnswer(Exception):
    """A question about the database itself (tables/columns) answered from the schema."""

    def __init__(self, text: str):
        self.text = text
        super().__init__(text)


@dataclass
class Intent:
    """Result of the single pre-flight intent call: needs a clarifying question,
    and/or the question requires multi-step agent analysis."""

    clarification: str | None = None
    analytical: bool = False


@dataclass
class AIConfig:
    """Per-workspace AI override (bring your own key). Values win over server settings."""

    provider: str  # "gemini" | "openai" | "ollama"
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None


@dataclass
class _EffectiveAI:
    provider: str
    gemini_key: str
    gemini_model: str
    openai_key: str
    openai_model: str
    ollama_url: str
    ollama_model: str
    api_key: str = ""
    model: str = ""
    base_url: str = ""


OPENAI_COMPATIBLE_PROVIDERS = {
    "openai": ("https://api.openai.com/v1", "gpt-4o-mini"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat"),
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "mistral": ("https://api.mistral.ai/v1", "mistral-large-latest"),
    "xai": ("https://api.x.ai/v1", "grok-2-latest"),
    "openrouter": ("https://openrouter.ai/api/v1", "anthropic/claude-3.5-sonnet"),
    "perplexity": ("https://api.perplexity.ai", "sonar"),
    "together": ("https://api.together.xyz/v1", "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
    "custom": ("", "default"),
}


def _normalize_gemini_model(model: str | None) -> str:
    m = (model or "").strip()
    if not m or m.lower() == "default":
        return get_settings().gemini_model or "gemini-3.5-flash-lite"
    return m


def _effective_ai(config: AIConfig | None) -> _EffectiveAI:
    settings = get_settings()
    provider = ((config.provider if config else None) or settings.llm_provider).strip().lower()
    org_key = config.api_key if config else None
    org_model = config.model if config else None
    org_base_url = config.base_url if config else None
    org_provider = (config.provider.strip().lower() if config else None)
    return _EffectiveAI(
        provider=provider,
        gemini_key=org_key if org_provider == "gemini" else getattr(settings, "gemini_api_key", ""),
        gemini_model=_normalize_gemini_model(org_model if (org_provider == "gemini" and org_model) else getattr(settings, "gemini_model", "gemini-3.5-flash-lite")),
        openai_key=org_key if org_provider == "openai" else getattr(settings, "openai_api_key", ""),
        openai_model=org_model if (org_provider == "openai" and org_model) else "gpt-4o-mini",
        ollama_url=org_base_url if (org_provider == "ollama" and org_base_url) else getattr(settings, "ollama_base_url", "http://127.0.0.1:11434"),
        ollama_model=org_model if (org_provider == "ollama" and org_model) else getattr(settings, "ollama_model", "qwen2.5-coder"),
        api_key=org_key or "",
        model=org_model or "",
        base_url=org_base_url or "",
    )


DIALECT_LABELS = {"mysql": "MySQL", "postgres": "PostgreSQL"}


def _dialect_label(db_type: str | None) -> str:
    return DIALECT_LABELS.get((db_type or "mysql").lower(), "MySQL")


def generate_sql(
    question: str,
    schema: dict,
    history: list[dict] | None = None,
    ai_config: AIConfig | None = None,
    db_type: str = "mysql",
) -> str:
    eff = _effective_ai(ai_config)
    schema_change = _detect_schema_change_request(question, schema, db_type=db_type)
    if schema_change:
        raise QueryUnderstandingError(schema_change)
    if not (schema.get("tables") or {}):
        raise QueryUnderstandingError(
            "I could not find any discovered tables for this connection. Re-test the database connection so QueryMind can read the schema."
        )

    prompt = _sql_prompt(question, schema, history, db_type)
    try:
        raw = _ai_generate(prompt, eff)
        sql = _sql_from_model_response(raw)
    except SchemaAnswer:
        raise
    except RuntimeError as exc:
        raise QueryUnderstandingError(str(exc))
    except httpx.HTTPStatusError as exc:
        raise QueryUnderstandingError(f"AI provider returned an error ({exc.response.status_code}): {exc.response.text[:200]}")
    except httpx.HTTPError as exc:
        raise QueryUnderstandingError(f"Could not reach AI provider ({eff.provider or 'unknown'}): {exc}")
    except QueryUnderstandingError:
        raise
    except Exception as exc:
        raise QueryUnderstandingError(f"AI query generation failed: {exc}")

    # System tables are off-limits — schema questions are answered directly.
    if re.search(r"\b(?:information_schema|performance_schema|pg_catalog|sqlite_master)\b|\bmysql\.", sql, re.IGNORECASE):
        raise QueryUnderstandingError(
            "I can't query system tables. I already know your schema — "
            'just ask "what tables do I have" or "what columns does products have" and I\'ll answer directly.'
        )
    # Hallucinated tables/columns from an LLM must never leave this layer.
    return _validated_sql(sql, schema)


def _intent_prompt(question: str, schema: dict, history: list[dict] | None, db_type: str) -> str:
    dialect = _dialect_label(db_type)
    return f"""
You are QueryMind's intent checker for a {dialect} assistant.

Decide two things about the user's latest message:

1. Could you write ONE correct {dialect} query that fully satisfies it using ONLY
the schema below and the conversation context? If not, write a short friendly
clarifying question.

2. Does answering it well require MULTI-STEP analysis — discovering row counts,
superlatives like "the biggest table" or "who bought the most", comparisons,
rankings, or aggregations spread across tables? Those need a tool-using agent,
not a single query. Set "analytical": true for them, false for simple lookups.

Respond with exactly one JSON object and nothing else:
{{"can_execute": true, "analytical": false}}
or
{{"can_execute": false, "question": "<one short friendly clarifying question>", "analytical": false}}

Ask a clarifying question ONLY when the latest message is genuinely unclear:
- it does not clearly reference any existing table or column from the schema,
- it is ambiguous between several tables or columns (offer the options in your question,
  e.g. "Do you mean the customers table or the orders table?"),
- or a write action (INSERT/UPDATE/DELETE) is missing required values.

Requests asking for charts, graphs, plots, diagrams, or visual representations of database data
are EXECUTABLE data queries — QueryMind automatically converts the returned data into charts and images.
Always answer {{"can_execute": true}} for chart/graph/diagram requests. NEVER decline or claim you cannot generate charts.

Questions about the database itself (what tables exist, what columns a table has)
are always clear — answer {{"can_execute": true}} for those.

If the request is clear enough to attempt, always answer {{"can_execute": true}}.
Never refuse clear requests. Never ask about SQL syntax or about anything already
visible in the schema. Ask at most one question.

{_history_block(history)}

Schema:
{_schema_block(schema)}

Latest user message:
{question}
""".strip()


def _call_intent(
    question: str,
    schema: dict,
    history: list[dict] | None,
    ai_config: AIConfig | None,
    db_type: str,
) -> Intent:
    eff = _effective_ai(ai_config)
    if not (schema.get("tables") or {}):
        return Intent()
    prompt = _intent_prompt(question, schema, history, db_type)
    try:
        raw = _ai_generate(prompt, eff)
    except (RuntimeError, httpx.HTTPError):
        return Intent()
    clarification, analytical = _parse_intent_response(raw)
    return Intent(clarification=clarification, analytical=analytical)


def classify_question(
    question: str,
    schema: dict,
    history: list[dict] | None = None,
    ai_config: AIConfig | None = None,
    db_type: str = "mysql",
) -> Intent:
    """Full intent result: clarification plus whether the question needs the
    multi-step agent (AI-driven routing instead of keyword matching)."""
    return _call_intent(question, schema, history, ai_config, db_type)


def _parse_intent_response(raw: str) -> tuple[str | None, bool]:
    raw = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip("` \n")
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return None, False
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None, False
    if not isinstance(data, dict):
        return None, False
    analytical = data.get("analytical") is True
    if data.get("can_execute") is not False:
        return None, analytical
    question = str(data.get("question", "")).strip()
    if not question or len(question) > 400:
        return None, analytical
    return question, analytical


def _history_block(history: list[dict] | None) -> str:
    if not history:
        return ""
    # Truncate each turn: long stored content is a prompt-injection and
    # token-waste vector when replayed into later prompts. System entries
    # (the rolling conversation summary) are kept out of the turn window so
    # they are never crowded out by newer messages.
    system_lines = [
        str(turn["content"])[:900] for turn in history if turn.get("role") == "system"
    ]
    turns = "\n".join(
        f"{turn['role']}: {str(turn['content'])[:400]}"
        for turn in history[-6:]
        if turn.get("role") != "system"
    )
    blocks = ""
    if system_lines:
        blocks += "\n".join(system_lines) + "\n"
    if turns:
        blocks += f"Recent conversation:\n{turns}\n"
    return blocks


def _schema_block(schema: dict) -> str:
    """Compact one-line-per-table rendering of the schema for prompts.

    Carries everything the models need (column names, types, primary keys,
    auto-increment, NOT NULL) at a fraction of the tokens the pretty-printed
    JSON used, so every LLM round trip finishes noticeably faster."""
    lines: list[str] = []
    for table, meta in (schema.get("tables") or {}).items():
        rendered = []
        for column in meta.get("columns", []):
            name = str(column.get("name", "")).strip()
            if not name:
                continue
            parts = [f"{name} {column.get('type', '')}".strip()]
            if str(column.get("key", "")).upper() == "PRI":
                parts.append("PK")
            if "auto_increment" in str(column.get("extra", "")).lower():
                parts.append("AUTO_INCREMENT")
            if column.get("nullable") is False:
                parts.append("NOT NULL")
            rendered.append(" ".join(parts))
        lines.append(f"{table}: {', '.join(rendered)}" if rendered else f"{table}: (no columns discovered)")
    return "\n".join(lines)


def _validated_sql(sql: str, schema: dict) -> str:
    validation = validate_sql(sql, schema)
    if not validation.ok:
        raise QueryUnderstandingError(validation.error)
    return sql


MUTATION_CLAIM_RE = re.compile(
    # "changed"/"modified" are excluded on purpose: summaries like
    # "the top customer changed their plan" describe the DATA, not a mutation.
    r"\b(dropped|deleted|removed|inserted|updated|added|created)\b",
    re.IGNORECASE,
)


def summarize_result(
    question: str,
    columns: list[str],
    rows: list[dict],
    requires_confirmation: bool,
    query_type: str = "unknown",
    ai_config: AIConfig | None = None,
) -> str:
    eff = _effective_ai(ai_config)
    if requires_confirmation:
        return "This query can modify data, so it is waiting for your confirmation before execution."
    summary = ""
    if eff.provider == "gemini":
        try:
            summary = _summarize_with_gemini(question, columns, rows, eff)
        except (RuntimeError, httpx.HTTPError) as exc:
            logger.warning("summary_llm_failed provider=gemini error=%s", exc)
    elif eff.provider == "openai":
        try:
            summary = _summarize_with_openai(question, columns, rows, eff)
        except (RuntimeError, httpx.HTTPError) as exc:
            logger.warning("summary_llm_failed provider=openai error=%s", exc)
    elif eff.provider in OPENAI_COMPATIBLE_PROVIDERS or eff.provider in {"anthropic", "custom"}:
        try:
            preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
            prompt = f"Summarize this database query result in one short, plain-English sentence.\n\nQuestion: {question}\nResult preview: {preview}"
            summary = _ai_generate(prompt, eff).strip()
        except (RuntimeError, httpx.HTTPError) as exc:
            logger.warning("summary_llm_failed provider=%s error=%s", eff.provider, exc)
    if not summary and eff.provider in {"gemini", "openai", "ollama"}:
        # For gemini/openai this Ollama call is a rescue path — bound it tightly
        # so a missing local server cannot stretch the request.
        ollama_timeout = (
            get_settings().ollama_fallback_timeout_seconds
            if eff.provider in {"gemini", "openai"}
            else None
        )
        try:
            summary = _summarize_with_ollama(question, columns, rows, eff, timeout=ollama_timeout)
        except Exception as exc:
            logger.warning("summary_ollama_failed error=%s", exc)
    summary = _sanitize_summary(summary, query_type, len(rows))
    if summary:
        return summary
    if not rows:
        return "The query ran successfully, but it did not return any rows."
    # Neutral wording: never echo the user's raw question back at them.
    return f"Query finished — {len(rows)} row(s) returned."


def _sanitize_summary(summary: str, query_type: str, row_count: int) -> str:
    # LLMs sometimes narrate a mutation that never happened (e.g. claiming a
    # DROP succeeded when a SELECT ran). Never allow that on read queries.
    if query_type in {"select", "unknown"} and summary and MUTATION_CLAIM_RE.search(summary):
        if row_count:
            return f"Found {row_count} row(s). The query only read data — nothing was changed."
        return "The query only read data and returned no rows — nothing was changed."
    return summary.strip()


READ_STARTER_RE = re.compile(
    r"^\s*(?:select|show|list|find|get|display|fetch|count|how many|what|which|who|chart|graph|plot|diagram)\b",
    re.IGNORECASE,
)
STRONG_DDL_RE = re.compile(r"\b(drop|truncate|rename|alter)\b", re.IGNORECASE)
# The generic "schema changes are blocked" reply may only fire on unmistakable
# DDL verbs. Everyday phrasing like "i want the top biggest table with 10 rows"
# contains a schema noun ("table") and a weak verb ("want") but is a read — it
# must fall through to the AI, not the canned safety message.
GENERIC_DDL_RE = re.compile(r"\b(drop|truncate|rename|alter|create)\b", re.IGNORECASE)
DDL_VERB_RE = re.compile(
    r"\b(add|create|new|drop|remove|delete|rename|modify|alter|change|truncate|"
    r"make|put|insert|append|extend|include|introduce|give|want|need|needs|have|has|should)\b",
    re.IGNORECASE,
)
# Includes common misspellings: coloumn, colum, collumn, feild
DDL_NOUN_RE = re.compile(r"\b(?:colou?mn|coll?umn|feild|field|attribute|table|index|schema)\b", re.IGNORECASE)
COLUMN_NOUN_RE = r"\b(?:colou?mn|coll?umn|feild|field)\b"


def _detect_schema_change_request(question: str, schema: dict, db_type: str = "mysql") -> str | None:
    lowered = question.lower()
    # MySQL quotes identifiers with backticks; PostgreSQL uses double quotes.
    quote = "`" if (db_type or "mysql").lower() == "mysql" else '"'
    if not DDL_NOUN_RE.search(lowered):
        return None
    if not DDL_VERB_RE.search(lowered):
        return None
    # "show customers with the city column" is a read, not a schema change —
    # unless a strong DDL verb like drop/truncate/alter appears.
    if READ_STARTER_RE.search(question) and not STRONG_DDL_RE.search(lowered):
        return None

    table: str | None
    try:
        table = _target_table_from_question(question, schema)
    except QueryUnderstandingError:
        table = None

    add_column = re.search(
        r"\b(?:add|create|new|make|put|insert|append|extend|include|give|want|need|has|have|should)\b"
        r"[^.?!]*?"
        r"(?:[`'\"]?([a-zA-Z_]\w*)[`'\"]?\s+)?\b(?:colou?mn|coll?umn|feild|field)\b"
        r"(?:\s+(?:called\s+|named\s+)?[`'\"]?([a-zA-Z_]\w*)[`'\"]?)?"
        r"(?:\s+(?:with\s+)?(?:type\s+)?([a-zA-Z]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?))?",
        lowered,
    )
    drop_column = re.search(
        r"\b(?:drop|remove|delete)\b[^.?!]*?"
        r"(?:[`'\"]?([a-zA-Z_]\w*)[`'\"]?\s+)?\b(?:colou?mn|coll?umn|feild|field)\b"
        r"(?:\s+(?:called\s+|named\s+)?[`'\"]?([a-zA-Z_]\w*)[`'\"]?)?",
        lowered,
    )

    filler_words = {
        "in", "to", "from", "into", "on", "with", "that", "which", "of", "and", "the",
        "new", "column", "field", "called", "named", "type"
    }

    if add_column:
        pre_name, post_name, raw_type = add_column.group(1), add_column.group(2), add_column.group(3)
        column_name = next(
            (candidate for candidate in (post_name, pre_name) if candidate and candidate.lower() not in filler_words),
            None,
        )
        if raw_type and raw_type.lower() in filler_words:
            raw_type = None
        if not column_name:
            if table:
                return (
                    "I couldn't tell which column to add. For example: \"add column phone in customers\". "
                    f"To add it yourself, run: ALTER TABLE {quote}{table}{quote} ADD COLUMN {quote}column_name{quote} VARCHAR(255) NULL;"
                )
            return _schema_change_needs_table(schema, "add a column")
        column_type = _normalize_column_type(raw_type)
        if table:
            return (
                f"Schema changes like adding columns are blocked in QueryMind for safety. "
                f"To add {quote}{column_name}{quote} yourself, run this in your database client:\n"
                f"ALTER TABLE {quote}{table}{quote} ADD COLUMN {quote}{column_name}{quote} {column_type} NULL;"
            )
        return _schema_change_needs_table(schema, "add a column")
    if drop_column:
        drop_pre, drop_post = drop_column.group(1), drop_column.group(2)
        column_name = next(
            (candidate for candidate in (drop_post, drop_pre) if candidate and candidate.lower() not in filler_words),
            None,
        )
        if not column_name:
            if table:
                return (
                    "I couldn't tell which column to drop. For example: \"drop the column phone from customers\". "
                    f"To drop it yourself, run: ALTER TABLE {quote}{table}{quote} DROP COLUMN {quote}column_name{quote};"
                )
            return _schema_change_needs_table(schema, "drop a column")
        if table:
            return (
                f"Schema changes like dropping columns are blocked in QueryMind for safety. "
                f"To remove {quote}{column_name}{quote} yourself, run this in your database client:\n"
                f"ALTER TABLE {quote}{table}{quote} DROP COLUMN {quote}{column_name}{quote};"
            )
        return _schema_change_needs_table(schema, "drop a column")

    if not GENERIC_DDL_RE.search(lowered):
        return None
    return (
        "Schema changes (creating, altering, or dropping tables and columns) are blocked in QueryMind "
        "for safety. I can only read data or run confirmed INSERT, UPDATE, and DELETE statements. "
        "Run schema changes directly in your database client."
    )


def _normalize_column_type(raw: str | None) -> str:
    if not raw:
        return "VARCHAR(255)"
    known = {
        "int", "integer", "bigint", "smallint", "text", "date", "datetime",
        "timestamp", "float", "double", "boolean", "bool", "json"
    }
    if "(" in raw or raw in known:
        return raw.upper()
    return f"VARCHAR(255) -- '{raw}' is not a known type; adjust if needed"


def _schema_change_needs_table(schema: dict, action: str) -> str:
    tables = ", ".join((schema.get("tables") or {}).keys()) or "none discovered"
    return (
        f"I can help draft that schema change, but I need to know which table. "
        f"Available tables: {tables}. Mention the table name to {action}."
    )


SQL_RULES = """
- Use only tables and columns from this schema.
- Support SELECT, INSERT, UPDATE, and DELETE.
- Do not generate CREATE, DROP, ALTER, TRUNCATE, GRANT, or REVOKE.
- Do not generate multiple statements.
- Never query system tables (information_schema, performance_schema, pg_catalog, sqlite_master) — answer those questions with a META: line instead.
- For INSERT requests, use the actual values provided by the user. For unspecified columns that represent numeric balances, counters, or totals (such as total_spent, balance, count), provide 0 or 0.00 as appropriate rather than NULL or leaving them undefined, unless the user explicitly requested otherwise.
- Add LIMIT 50 to broad SELECT queries when the user does not request a limit.
- Use the recent conversation to resolve short follow-up answers like "yes" or "the customers one".
"""


def _sql_prompt(question: str, schema: dict, history: list[dict] | None = None, db_type: str = "mysql") -> str:
    dialect = _dialect_label(db_type)
    return f"""
You are QueryMind's SQL generator.

If the latest request asks for a visual, chart, graph, diagram, plot, or table visualization,
generate the single {dialect} query that fetches the necessary rows, grouped categories, or metrics.
Do not decline or say you cannot draw — the platform renders the chart from your query data.

If the latest request is about the database itself — what tables exist, what
columns a table has, a table's structure — do NOT write SQL. Reply with a single
line starting with "META:" followed by a short friendly answer based ONLY on
the schema below. Example: "META: Your database has 2 tables: customers (3 columns)
and orders (3 columns). Ask me for rows anytime."

If the latest message is not a data request at all — a greeting, thanks, small
talk, or plain conversation — do NOT write SQL either. Reply with "META:" and
one short, warm conversational sentence (e.g. "META: You're welcome! Ask me
anything else about your data.").

Otherwise generate exactly one valid {dialect} query for the user's latest request.
Use {dialect} syntax and quoting rules. Return only SQL. Do not use markdown. Do not explain.

Rules:
{SQL_RULES}
{_history_block(history)}
Schema:
{_schema_block(schema)}

Latest user request:
{question}
""".strip()


def _sql_from_model_response(raw: str) -> str:
    """Raise SchemaAnswer when the model replied conversationally (META: ... or
    any non-SQL text), otherwise extract the SQL statement.

    A conversational reply ("You're welcome!", a greeting, a clarifying
    sentence) must reach the user as the AI's own words — converting it to an
    error made the pipeline fall through to the canned table-listing message
    even though the AI had answered perfectly well."""
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"```(?:[a-zA-Z]+)?", "", text).strip("` \n")
    match = re.match(r"META\s*:\s*(.+)", text, flags=re.IGNORECASE | re.DOTALL)
    if match:
        answer = match.group(1).strip()
        if answer:
            raise SchemaAnswer(answer)
    try:
        return _extract_sql(text)
    except RuntimeError:
        conversational = text.strip()
        if conversational and len(conversational) <= 600:
            raise SchemaAnswer(conversational) from None
        raise


def _generate_sql_with_gemini(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_gemini_generate(_sql_prompt(question, schema, history, db_type), eff))


def _generate_sql_with_openai(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_openai_generate(_sql_prompt(question, schema, history, db_type), eff))


def _generate_sql_with_ollama(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_ollama_generate(_sql_prompt(question, schema, history, db_type), eff))


def _summarize_with_gemini(question: str, columns: list[str], rows: list[dict], eff: _EffectiveAI | None = None) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _gemini_generate(prompt, eff).strip()


def _summarize_with_openai(question: str, columns: list[str], rows: list[dict], eff: _EffectiveAI | None = None) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _openai_generate(prompt, eff).strip()


def _summarize_with_ollama(
    question: str,
    columns: list[str],
    rows: list[dict],
    eff: _EffectiveAI | None = None,
    timeout: int | None = None,
) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _ollama_generate(prompt, eff, timeout=timeout).strip()


_HTTP_CLIENT: httpx.Client | None = None


def _get_http_client(timeout: float | None = None) -> httpx.Client:
    global _HTTP_CLIENT
    to = timeout or float(get_settings().llm_timeout_seconds)
    if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed:
        _HTTP_CLIENT = httpx.Client(timeout=to, follow_redirects=True)
    return _HTTP_CLIENT


def _gemini_generate(prompt: str, eff: _EffectiveAI | None = None) -> str:
    api_key = eff.gemini_key if eff else get_settings().gemini_api_key
    model = _normalize_gemini_model(eff.gemini_model if eff else get_settings().gemini_model)
    if not api_key:
        raise RuntimeError("Gemini API key is not configured")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    client = _get_http_client(timeout=float(get_settings().llm_timeout_seconds))
    response = client.post(
        url,
        # The key travels in a header, never in the URL, so it cannot leak
        # into proxy logs or access logs.
        headers={"x-goog-api-key": api_key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "candidateCount": 1,
            },
        },
        timeout=get_settings().llm_timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(str(part.get("text", "")) for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


def _anthropic_generate(prompt: str, eff: _EffectiveAI | None = None) -> str:
    api_key = eff.api_key if eff else ""
    model = (eff.model if eff and eff.model else "claude-3-5-sonnet-20241022")
    if not api_key:
        raise RuntimeError("Anthropic API key is not configured")

    response = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.1,
        },
        timeout=get_settings().llm_timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    contents = data.get("content") or []
    text = "".join(str(c.get("text", "")) for c in contents if c.get("type") == "text").strip()
    if not text:
        raise RuntimeError("Anthropic returned an empty response")
    return text


def _openai_compatible_generate(prompt: str, eff: _EffectiveAI) -> str:
    provider = eff.provider
    default_base, default_model = OPENAI_COMPATIBLE_PROVIDERS.get(provider, ("", "gpt-4o-mini"))
    base_url = (eff.base_url or default_base).rstrip("/")
    model = eff.model or default_model
    api_key = eff.api_key or (eff.openai_key if provider == "openai" else "")
    if not api_key and provider != "custom":
        raise RuntimeError(f"{provider.title()} API key is not configured")

    url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://querymind.io"
        headers["X-Title"] = "QueryMind"

    response = httpx.post(
        url,
        headers=headers,
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        },
        timeout=get_settings().llm_timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"{provider.title()} returned no choices")
    text = str(choices[0].get("message", {}).get("content", "")).strip()
    if not text:
        raise RuntimeError(f"{provider.title()} returned an empty response")
    return text


def _openai_generate(prompt: str, eff: _EffectiveAI | None = None) -> str:
    api_key = (eff.api_key or eff.openai_key) if eff else get_settings().openai_api_key
    model = (eff.model or eff.openai_model) if eff else "gpt-4o-mini"
    if not api_key:
        raise RuntimeError("OpenAI API key is not configured")

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        },
        timeout=get_settings().llm_timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI returned no choices")
    text = str(choices[0].get("message", {}).get("content", "")).strip()
    if not text:
        raise RuntimeError("OpenAI returned an empty response")
    return text


def _ollama_generate(prompt: str, eff: _EffectiveAI | None = None, timeout: int | None = None) -> str:
    settings = get_settings()
    base_url = (eff.base_url or eff.ollama_url) if eff else settings.ollama_base_url
    model = (eff.model or eff.ollama_model) if eff else settings.ollama_model
    url = f"{base_url.rstrip('/')}/api/generate"
    response = httpx.post(
        url,
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1},
        },
        timeout=timeout if timeout is not None else settings.llm_timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    return str(data.get("response", "")).strip()


def _ai_generate(prompt: str, eff: _EffectiveAI) -> str:
    """Route a one-shot prompt to whichever provider is configured."""
    if eff.provider == "gemini":
        return _gemini_generate(prompt, eff)
    if eff.provider == "anthropic":
        return _anthropic_generate(prompt, eff)
    if eff.provider == "ollama":
        return _ollama_generate(prompt, eff)
    if eff.provider in OPENAI_COMPATIBLE_PROVIDERS or eff.provider == "custom":
        return _openai_compatible_generate(prompt, eff)
    return _openai_generate(prompt, eff)


def _as_number(value) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def chart_shape_ok(columns: list[str], rows: list[dict], max_rows: int = 12) -> bool:
    """True when the result's shape can be drawn readably: at least one
    mostly-numeric column plus a label column, within the row budget."""
    if len(rows) < 2 or len(rows) > max_rows or len(columns) < 2:
        return False
    has_numeric = False
    has_label = False
    for column in columns:
        values = [row.get(column) for row in rows]
        usable = [value for value in values if value is not None and str(value).strip() != ""]
        if not usable:
            continue
        numeric_ratio = sum(1 for value in usable if _as_number(value) is not None) / len(usable)
        if numeric_ratio >= 0.8:
            has_numeric = True
        elif not has_label:
            has_label = True
    return has_numeric and has_label


def decide_visualization(
    question: str,
    columns: list[str],
    rows: list[dict],
    ai_config: AIConfig | None = None,
    deadline: float | None = None,
) -> str:
    """AI-driven choice of how to present a result: "chart", "table" or "text".

    The AI sees the question and a preview of the result, so an explicit ask
    ("show it as a diagram") wins even when the data shape is borderline.
    Falls back to a shape heuristic whenever AI is unavailable or the request
    is out of time budget."""
    if not rows or not columns:
        return "text"
    heuristic = "chart" if chart_shape_ok(columns, rows) else "table"
    eff = _effective_ai(ai_config)
    if eff.provider not in {"gemini", "openai", "ollama"}:
        return heuristic
    if deadline is not None and time.monotonic() >= deadline - 6:
        return heuristic

    preview = [
        {str(key)[:24]: str(value)[:40] for key, value in list(row.items())[:8]}
        for row in rows[:3]
    ]
    prompt = (
        f"User question: {str(question)[:300]}\n"
        f"Result columns: {[str(c) for c in columns[:10]]}\n"
        f"First rows: {json.dumps(preview, default=str)[:600]}\n\n"
        "Decide how to present this result in a chat UI. Reply with exactly one word:\n"
        "chart - the user asked for a visual/diagram/graph/trend, or the numbers clearly benefit from one\n"
        "table - the data is best read as a table\n"
        "text - a single value or plain explanation needs no visual\n"
        "One word only:"
    )
    try:
        raw = _ai_generate(prompt, eff).strip().lower()
    except Exception:
        return heuristic
    if "chart" in raw or "visual" in raw or "graph" in raw or "diagram" in raw:
        return "chart"
    if "text" in raw:
        return "text"
    if "table" in raw:
        return "table"
    return heuristic


def compress_history(
    previous_summary: str | None,
    recent_messages: list[dict],
    ai_config: AIConfig | None = None,
) -> str | None:
    """Distill the conversation into a short running summary ("memory") that
    later prompts inject so follow-up answers keep their context. Returns None
    when there is no AI to do it or the call fails - callers then keep the
    previous summary untouched."""
    eff = _effective_ai(ai_config)
    if eff.provider not in {"gemini", "openai", "ollama"}:
        return None
    if not recent_messages:
        return previous_summary
    transcript = "\n".join(
        f"{message.get('role', 'user')}: {str(message.get('content', ''))[:400]}"
        for message in recent_messages[-10:]
    )
    previous = f"Summary so far:\n{previous_summary}\n\n" if previous_summary else ""
    prompt = (
        f"{previous}Latest messages:\n{transcript}\n\n"
        "Merge everything above into one running summary for an assistant that must "
        "answer follow-up questions later. Keep the key facts: tables and columns "
        "discussed, filters, numbers, names, and what the user is trying to learn. "
        "At most 8 short bullet lines starting with '- '. Output only the summary."
    )
    try:
        text = _ai_generate(prompt, eff).strip()
    except Exception:
        return None
    return text[:1200] or None


def _extract_sql(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.IGNORECASE | re.DOTALL)
    fenced = re.search(r"```(?:sql)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    sql = fenced.group(1) if fenced else text
    sql = sql.strip().strip("`").strip()
    match = re.search(r"\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*", sql, flags=re.IGNORECASE)
    if match:
        sql = match.group(0).strip()
    else:
        raise RuntimeError("Model did not return SQL")
    if ";" in sql:
        sql = sql.split(";", 1)[0]
    return sql


def _target_table_from_question(question: str, schema: dict) -> str:
    tables = list((schema.get("tables") or {}).keys())
    mentions = _mentioned_tables(question, tables)
    if len(mentions) == 1:
        return mentions[0]
    if len(mentions) > 1:
        table_list = ", ".join(mentions)
        raise QueryUnderstandingError(
            f"I found multiple possible tables ({table_list}). Please ask again with one exact table name."
        )

    table_list = ", ".join(tables)
    raise QueryUnderstandingError(
        f"I could not match your request to a table in the connected database. Available tables: {table_list}. "
        "Please mention the exact table and the values you want to use."
    )


def _mentioned_tables(question: str, tables: list[str]) -> list[str]:
    normalized_question = question.lower()
    mentioned = []
    for table in tables:
        table_name = table.lower()
        singular = table_name[:-1] if table_name.endswith("s") else table_name
        patterns = {table_name, singular, table_name.replace("_", " "), singular.replace("_", " ")}
        if any(re.search(rf"\b{re.escape(pattern)}\b", normalized_question) for pattern in patterns if pattern):
            mentioned.append(table)
    return mentioned
