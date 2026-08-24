import json
import re

import httpx

from app.core.config import get_settings


class QueryUnderstandingError(ValueError):
    pass


def generate_sql(question: str, schema: dict) -> str:
    settings = get_settings()
    schema_change = _detect_schema_change_request(question, schema)
    if schema_change:
        raise QueryUnderstandingError(schema_change)
    table = _ensure_question_can_target_schema(question, schema)
    _ensure_insert_has_enough_details(question, schema, table)
    if settings.llm_provider == "gemini":
        try:
            return _generate_sql_with_gemini(question, schema)
        except (RuntimeError, httpx.HTTPError):
            return _generate_sql_with_ollama_or_fallback(question, schema)
    if settings.llm_provider == "ollama":
        return _generate_sql_with_ollama_or_fallback(question, schema)
    return _generate_sql_fallback(question, schema)


MUTATION_CLAIM_RE = re.compile(
    r"\b(dropped|deleted|removed|updated|added|created|inserted|modified|changed)\b",
    re.IGNORECASE,
)


def summarize_result(
    question: str,
    columns: list[str],
    rows: list[dict],
    requires_confirmation: bool,
    query_type: str = "unknown",
) -> str:
    settings = get_settings()
    if requires_confirmation:
        return "This query can modify data, so it is waiting for your confirmation before execution."
    summary = ""
    if settings.llm_provider == "gemini":
        try:
            summary = _summarize_with_gemini(question, columns, rows)
        except (RuntimeError, httpx.HTTPError):
            pass
    if not summary and settings.llm_provider in {"gemini", "ollama"}:
        try:
            summary = _summarize_with_ollama(question, columns, rows)
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


def _detect_schema_change_request(question: str, schema: dict) -> str | None:
    lowered = question.lower()
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
                    f"To add it yourself, run: ALTER TABLE `{table}` ADD COLUMN `column_name` VARCHAR(255) NULL;"
                )
            return _schema_change_needs_table(schema, "add a column")
        column_type = _normalize_column_type(raw_type)
        if table:
            return (
                f"Schema changes like adding columns are blocked in QueryMind for safety. "
                f"To add `{column_name}` yourself, run this in your MySQL client:\n"
                f"ALTER TABLE `{table}` ADD COLUMN `{column_name}` {column_type} NULL;"
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
                    f"To drop it yourself, run: ALTER TABLE `{table}` DROP COLUMN `column_name`;"
                )
            return _schema_change_needs_table(schema, "drop a column")
        if table:
            return (
                f"Schema changes like dropping columns are blocked in QueryMind for safety. "
                f"To remove `{column_name}` yourself, run this in your MySQL client:\n"
                f"ALTER TABLE `{table}` DROP COLUMN `{column_name}`;"
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


def _generate_sql_with_gemini(question: str, schema: dict) -> str:
    schema_text = json.dumps(schema, indent=2)
    prompt = f"""
You are QueryMind's SQL generator.

Generate exactly one MySQL query for the user's request.
Return only SQL. Do not use markdown. Do not explain.

Rules:
- Use only tables and columns from this schema.
- If the request does not clearly name an existing table or existing table concept, do not guess.
- Support SELECT, INSERT, UPDATE, and DELETE.
- Do not generate CREATE, DROP, ALTER, TRUNCATE, GRANT, or REVOKE.
- Do not generate multiple statements.
- For INSERT requests, use the actual values from the user's request. Do not invent generic values like 'New item'.
- Add LIMIT 50 to broad SELECT queries when the user does not request a limit.

Schema:
{schema_text}

User request:
{question}
""".strip()
    response = _gemini_generate(prompt)
    return _extract_sql(response)


def _generate_sql_with_ollama(question: str, schema: dict) -> str:
    schema_text = json.dumps(schema, indent=2)
    prompt = f"""
You are QueryMind's SQL generator.

Generate exactly one MySQL query for the user's request.
Return only SQL. Do not use markdown. Do not explain.

Rules:
- Use only tables and columns from this schema.
- If the request does not clearly name an existing table or existing table concept, do not guess.
- Support SELECT, INSERT, UPDATE, and DELETE.
- Do not generate CREATE, DROP, ALTER, TRUNCATE, GRANT, or REVOKE.
- Do not generate multiple statements.
- For INSERT requests, use the actual values from the user's request. Do not invent generic values like 'New item'.
- Add LIMIT 50 to broad SELECT queries when the user does not request a limit.

Schema:
{schema_text}

User request:
{question}
""".strip()
    response = _ollama_generate(prompt)
    return _extract_sql(response)


def _generate_sql_with_ollama_or_fallback(question: str, schema: dict) -> str:
    try:
        return _generate_sql_with_ollama(question, schema)
    except (RuntimeError, httpx.HTTPError):
        return _generate_sql_fallback(question, schema)


def _summarize_with_gemini(question: str, columns: list[str], rows: list[dict]) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _gemini_generate(prompt).strip()


def _summarize_with_ollama(question: str, columns: list[str], rows: list[dict]) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _ollama_generate(prompt).strip()


def _gemini_generate(prompt: str) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("Gemini API key is not configured")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    response = httpx.post(
        url,
        params={"key": settings.gemini_api_key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "candidateCount": 1,
            },
        },
        timeout=60,
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


def _ollama_generate(prompt: str) -> str:
    settings = get_settings()
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    response = httpx.post(
        url,
        json={
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1},
        },
        timeout=60,
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
        escaped_values = ", ".join(f"'{value.replace("'", "''")}'" for value in values.values())
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
