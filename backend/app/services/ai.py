import json
import re
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.services.sql_validator import validate_sql


class QueryUnderstandingError(ValueError):
    pass


class SchemaAnswer(Exception):
    """A question about the database itself (tables/columns) answered from the schema."""

    def __init__(self, text: str):
        self.text = text
        super().__init__(text)


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


def _effective_ai(config: AIConfig | None) -> _EffectiveAI:
    settings = get_settings()
    provider = (config.provider if config else None) or settings.llm_provider
    org_key = config.api_key if config else None
    org_model = config.model if config else None
    org_base_url = config.base_url if config else None
    org_provider = config.provider if config else None
    return _EffectiveAI(
        provider=provider,
        gemini_key=org_key if org_provider == "gemini" else getattr(settings, "gemini_api_key", ""),
        gemini_model=org_model if (org_provider == "gemini" and org_model) else getattr(settings, "gemini_model", ""),
        openai_key=org_key if org_provider == "openai" else getattr(settings, "openai_api_key", ""),
        openai_model=org_model if (org_provider == "openai" and org_model) else "gpt-4o-mini",
        ollama_url=org_base_url if (org_provider == "ollama" and org_base_url) else getattr(settings, "ollama_base_url", ""),
        ollama_model=org_model if (org_provider == "ollama" and org_model) else getattr(settings, "ollama_model", ""),
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
    if eff.provider == "gemini":
        try:
            # The LLM can handle JOINs across multiple tables — no single-table restriction.
            sql = _generate_sql_with_gemini(question, schema, history, eff, db_type)
        except (RuntimeError, httpx.HTTPError):
            sql = _generate_sql_with_ollama_or_fallback(
                question, schema, history=history, eff=eff,
                timeout=get_settings().ollama_fallback_timeout_seconds,
                db_type=db_type,
            )
    elif eff.provider == "openai":
        try:
            sql = _generate_sql_with_openai(question, schema, history, eff, db_type)
        except (RuntimeError, httpx.HTTPError):
            sql = _generate_sql_with_ollama_or_fallback(
                question, schema, history=history, eff=eff,
                timeout=get_settings().ollama_fallback_timeout_seconds,
                db_type=db_type,
            )
    elif eff.provider == "ollama":
        sql = _generate_sql_with_ollama_or_fallback(
            question, schema, history, eff,
            timeout=get_settings().ollama_fallback_timeout_seconds,
            db_type=db_type,
        )
    else:
        # Deterministic fallback can only target one table.
        table = _ensure_question_can_target_schema(question, schema)
        _ensure_insert_has_enough_details(question, schema, table)
        sql = _generate_sql_fallback(question, schema)
    # System tables are off-limits — schema questions are answered directly.
    if re.search(r"\b(?:information_schema|performance_schema|pg_catalog|sqlite_master)\b|\bmysql\.", sql, re.IGNORECASE):
        raise QueryUnderstandingError(
            "I can't query MySQL's internal system tables. I already know your schema — "
            'just ask "what tables do I have" or "what columns does products have" and I\'ll answer directly.'
        )
    # Hallucinated tables/columns from an LLM must never leave this layer.
    return _validated_sql(sql, schema)


def evaluate_clarity(
    question: str,
    schema: dict,
    history: list[dict] | None = None,
    ai_config: AIConfig | None = None,
    db_type: str = "mysql",
) -> str | None:
    """Return a short clarifying question when the request cannot be confidently
    mapped to the schema; return None when QueryMind should go ahead and run."""
    eff = _effective_ai(ai_config)
    if eff.provider not in {"gemini", "openai", "ollama"} or not (schema.get("tables") or {}):
        return None
    dialect = _dialect_label(db_type)
    prompt = f"""
You are QueryMind's intent checker for a {dialect} assistant.

Decide whether you could write ONE correct {dialect} query that fully satisfies the
user's latest message using ONLY the schema below and the conversation context.

Respond with exactly one JSON object and nothing else:
{{"can_execute": true}}
or
{{"can_execute": false, "question": "<one short friendly clarifying question>"}}

Ask a clarifying question ONLY when the latest message is genuinely unclear:
- it does not clearly reference any existing table or column from the schema,
- it is ambiguous between several tables or columns (offer the options in your question,
  e.g. "Do you mean the customers table or the orders table?"),
- or a write action (INSERT/UPDATE/DELETE) is missing required values.

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
    try:
        if eff.provider == "gemini":
            raw = _gemini_generate(prompt, eff)
        elif eff.provider == "openai":
            raw = _openai_generate(prompt, eff)
        else:
            raw = _ollama_generate(prompt, eff)
    except (RuntimeError, httpx.HTTPError):
        return None
    return _parse_clarity_response(raw)


def _parse_clarity_response(raw: str) -> str | None:
    raw = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip("` \n")
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("can_execute") is not False:
        return None
    question = str(data.get("question", "")).strip()
    if not question or len(question) > 400:
        return None
    return question


def _history_block(history: list[dict] | None) -> str:
    if not history:
        return ""
    # Truncate each turn: long stored content is a prompt-injection and
    # token-waste vector when replayed into later prompts.
    turns = "\n".join(
        f"{turn['role']}: {str(turn['content'])[:400]}" for turn in history[-6:]
    )
    return f"Recent conversation:\n{turns}\n"


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
        except (RuntimeError, httpx.HTTPError):
            pass
    elif eff.provider == "openai":
        try:
            summary = _summarize_with_openai(question, columns, rows, eff)
        except (RuntimeError, httpx.HTTPError):
            pass
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
        except Exception:
            pass
    summary = _sanitize_summary(summary, query_type, len(rows))
    if summary:
        return summary
    if not rows:
        return "The query ran successfully, but it did not return any rows."
    return f"Found {len(rows)} row(s) for: {question}"


def _sanitize_summary(summary: str, query_type: str, row_count: int) -> str:
    # LLMs sometimes narrate a mutation that never happened (e.g. claiming a
    # DROP succeeded when a SELECT ran). Never allow that on read queries.
    if query_type in {"select", "unknown"} and summary and MUTATION_CLAIM_RE.search(summary):
        if row_count:
            return f"Found {row_count} row(s). The query only read data — nothing was changed."
        return "The query only read data and returned no rows — nothing was changed."
    return summary.strip()


READ_STARTER_RE = re.compile(
    r"^\s*(?:select|show|list|find|get|display|fetch|count|how many|what|which|who)\b",
    re.IGNORECASE,
)
STRONG_DDL_RE = re.compile(r"\b(drop|truncate|rename|alter)\b", re.IGNORECASE)
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
- For INSERT requests, use the actual values from the user's request. Do not invent generic values like 'New item'.
- Add LIMIT 50 to broad SELECT queries when the user does not request a limit.
- Use the recent conversation to resolve short follow-up answers like "yes" or "the customers one".
"""


def _sql_prompt(question: str, schema: dict, history: list[dict] | None = None, db_type: str = "mysql") -> str:
    dialect = _dialect_label(db_type)
    return f"""
You are QueryMind's SQL generator.

If the latest request is about the database itself — what tables exist, what
columns a table has, a table's structure — do NOT write SQL. Reply with a single
line starting with "META:" followed by a short friendly answer based ONLY on
the schema below. Example: "META: Your database has 2 tables: customers (3 columns)
and orders (3 columns). Ask me for rows anytime."

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
    """Raise SchemaAnswer when the model replied conversationally (META: ...),
    otherwise extract the SQL statement."""
    text = re.sub(r"```(?:[a-zA-Z]+)?", "", raw).strip("` \n")
    match = re.match(r"META\s*:\s*(.+)", text, flags=re.IGNORECASE | re.DOTALL)
    if match:
        answer = match.group(1).strip()
        if answer:
            raise SchemaAnswer(answer)
    return _extract_sql(raw)


def _generate_sql_with_gemini(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_gemini_generate(_sql_prompt(question, schema, history, db_type), eff))


def _generate_sql_with_openai(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_openai_generate(_sql_prompt(question, schema, history, db_type), eff))


def _generate_sql_with_ollama(question: str, schema: dict, history: list[dict] | None = None, eff: _EffectiveAI | None = None, db_type: str = "mysql") -> str:
    return _sql_from_model_response(_ollama_generate(_sql_prompt(question, schema, history, db_type), eff))


def _generate_sql_with_ollama_or_fallback(
    question: str,
    schema: dict,
    history: list[dict] | None = None,
    eff: _EffectiveAI | None = None,
    timeout: int | None = None,
    db_type: str = "mysql",
) -> str:
    try:
        return _ollama_generate(_sql_prompt(question, schema, history, db_type), eff, timeout=timeout)
    except (RuntimeError, httpx.HTTPError):
        return _generate_sql_fallback(question, schema)


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


def _gemini_generate(prompt: str, eff: _EffectiveAI | None = None) -> str:
    api_key = eff.gemini_key if eff else get_settings().gemini_api_key
    model = eff.gemini_model if eff else get_settings().gemini_model
    if not api_key:
        raise RuntimeError("Gemini API key is not configured")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    response = httpx.post(
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


def _openai_generate(prompt: str, eff: _EffectiveAI | None = None) -> str:
    api_key = eff.openai_key if eff else get_settings().openai_api_key
    model = eff.openai_model if eff else "gpt-4o-mini"
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
    base_url = eff.ollama_url if eff else settings.ollama_base_url
    model = eff.ollama_model if eff else settings.ollama_model
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


def _generate_sql_fallback(question: str, schema: dict) -> str:
    lowered = question.lower()
    table = _target_table_from_question(question, schema)

    if any(word in lowered for word in ["delete", "remove"]):
        return f"DELETE FROM {table} WHERE id = 1"
    if any(word in lowered for word in ["update", "change", "set"]):
        return f"UPDATE {table} SET name = 'Updated' WHERE id = 1"
    if any(word in lowered for word in ["insert", "add", "create"]):
        values = _insert_values_from_question(question, schema, table)
        columns = ", ".join(values.keys())
        escaped_values = ", ".join(
            "'" + value.replace("'", "''") + "'" for value in values.values()
        )
        return f"INSERT INTO {table} ({columns}) VALUES ({escaped_values})"
    return f"SELECT * FROM {table} LIMIT 50"


def _ensure_question_can_target_schema(question: str, schema: dict) -> str:
    if not (schema.get("tables") or {}):
        raise QueryUnderstandingError(
            "I could not find any discovered tables for this connection. Re-test the database connection so QueryMind can read the schema."
        )
    return _target_table_from_question(question, schema)


def _ensure_insert_has_enough_details(question: str, schema: dict, table: str) -> None:
    lowered = question.lower()
    if not any(word in lowered for word in ["insert", "add", "create"]):
        return

    insert_columns = _insertable_columns(schema, table)
    if not insert_columns:
        raise QueryUnderstandingError(
            f"I can see the {table} table, but I could not find any columns that should be filled for a new record."
        )

    values = _insert_values_from_question(question, schema, table)
    missing = [column for column in insert_columns if column not in values]
    if missing:
        provided = ", ".join(f"{column}={value}" for column, value in values.items()) or "no field values"
        needed = ", ".join(missing)
        raise QueryUnderstandingError(
            f"I need more details before creating a new row in {table}. I understood {provided}. "
            f"Please provide: {needed}."
        )


def _insertable_columns(schema: dict, table: str) -> list[str]:
    columns = schema.get("tables", {}).get(table, {}).get("columns", [])
    insertable = []
    for column in columns:
        name = str(column.get("name", ""))
        if not name:
            continue
        key = str(column.get("key", "")).upper()
        extra = str(column.get("extra", "")).lower()
        has_default = "default" in column and column.get("default") is not None
        nullable = bool(column.get("nullable", False))
        if key == "PRI" or "auto_increment" in extra or name.lower() in {"id", "created_at", "updated_at"}:
            continue
        if nullable or has_default:
            continue
        insertable.append(name)
    if not insertable:
        for column in columns:
            name = str(column.get("name", ""))
            key = str(column.get("key", "")).upper()
            if name and key != "PRI" and name.lower() not in {"id", "created_at", "updated_at"}:
                insertable.append(name)
    return insertable


def _insert_values_from_question(question: str, schema: dict, table: str) -> dict[str, str]:
    values: dict[str, str] = {}
    insertable_columns = _insertable_columns(schema, table)
    column_terms = "|".join(re.escape(column.replace("_", " ")) for column in insertable_columns)
    for column in insertable_columns:
        column_text = re.escape(column.replace("_", " "))
        pattern = rf"\b{column_text}\b\s*(?:is|=|:)\s*['\"]?(.+?)(?=(?:['\"]?\s*(?:,|;)\s*)|\s+\b(?:{column_terms})\b\s*(?:is|=|:)|$)"
        match = re.search(pattern, question, flags=re.IGNORECASE)
        if match:
            values[column] = match.group(1).strip().strip("'\"")
    return values


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
