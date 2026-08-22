import json
import re

import httpx

from app.core.config import get_settings


class QueryUnderstandingError(ValueError):
    pass


def generate_sql(question: str, schema: dict) -> str:
    settings = get_settings()
    _ensure_question_can_target_schema(question, schema)
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
        return f"INSERT INTO {table} (name) VALUES ('New item')"
    return f"SELECT * FROM {table} LIMIT 50"


def _ensure_question_can_target_schema(question: str, schema: dict) -> None:
    if not (schema.get("tables") or {}):
        raise QueryUnderstandingError(
            "I could not find any discovered tables for this connection. Re-test the database connection so QueryMind can read the schema."
        )
    _target_table_from_question(question, schema)


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
