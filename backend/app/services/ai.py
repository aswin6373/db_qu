def generate_sql(question: str, schema: dict) -> str:
    lowered = question.lower()
    tables = list((schema.get("tables") or {}).keys())
    table = tables[0] if tables else "customers"

    if any(word in lowered for word in ["delete", "remove"]):
        return f"DELETE FROM {table} WHERE id = 1"
    if any(word in lowered for word in ["update", "change", "set"]):
        return f"UPDATE {table} SET name = 'Updated' WHERE id = 1"
    if any(word in lowered for word in ["insert", "add", "create"]):
        return f"INSERT INTO {table} (name) VALUES ('New item')"
    return f"SELECT * FROM {table} LIMIT 50"


def summarize_result(question: str, columns: list[str], rows: list[dict], requires_confirmation: bool) -> str:
    if requires_confirmation:
        return "This query can modify data, so it is waiting for your confirmation before execution."
    if not rows:
        return "The query ran successfully, but it did not return any rows."
    return f"Found {len(rows)} row(s) for: {question}"
