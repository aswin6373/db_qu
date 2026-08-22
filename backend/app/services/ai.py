import json
import re

import httpx

from app.core.config import get_settings


class QueryUnderstandingError(ValueError):
    pass


def generate_sql(question: str, schema: dict) -> str:
    settings = get_settings()
    table = _ensure_question_can_target_schema(question, schema)
    _ensure_insert_has_enough_details(question, schema, table)
    if settings.llm_provider == "ollama":
        try:
            return _generate_sql_with_ollama(question, schema)
        except httpx.HTTPError:
            return _generate_sql_fallback(question, schema)
    return _generate_sql_fallback(question, schema)


def summarize_result(question: str, columns: list[str], rows: list[dict], requires_confirmation: bool) -> str:
    settings = get_settings()
    if requires_confirmation:
        return "This query can modify data, so it is waiting for your confirmation before execution."
    if settings.llm_provider == "ollama":
        try:
            return _summarize_with_ollama(question, columns, rows)
        except Exception:
            pass
    if not rows:
        return "The query ran successfully, but it did not return any rows."
    return f"Found {len(rows)} row(s) for: {question}"


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


def _summarize_with_ollama(question: str, columns: list[str], rows: list[dict]) -> str:
    preview = json.dumps({"columns": columns, "rows": rows[:10]}, default=str)
    prompt = f"""
Summarize this database query result in one short, plain-English sentence.

Question: {question}
Result preview: {preview}
""".strip()
    return _ollama_generate(prompt).strip()


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
