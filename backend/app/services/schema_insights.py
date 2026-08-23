from collections import Counter
from typing import Any


def build_schema_insights(schema: dict[str, Any]) -> dict[str, Any]:
    tables = schema.get("tables") or {}
    table_items = list(tables.items())
    table_count = len(table_items)
    column_count = sum(len(table.get("columns", [])) for _, table in table_items)
    key_count = sum(1 for _, table in table_items for column in table.get("columns", []) if column.get("key"))
    edges = _relationship_edges(tables)
    suggestions = _suggestions(tables, edges)
    score = _readiness_score(table_count, column_count, key_count, suggestions)
    return {
        "score": score,
        "summary": _summary(score, table_count, column_count, len(edges), len(suggestions)),
        "table_count": table_count,
        "column_count": column_count,
        "key_count": key_count,
        "relationship_count": len(edges),
        "edges": edges,
        "suggestions": suggestions,
    }


def _relationship_edges(tables: dict[str, Any]) -> list[dict[str, str]]:
    table_names = set(tables.keys())
    singular_to_table = {
        (name[:-1] if name.endswith("s") else name): name
        for name in table_names
    }
    edges: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for table_name, table in tables.items():
        for column in table.get("columns", []):
            column_name = str(column.get("name", ""))
            if not column_name.endswith("_id"):
                continue
            target_hint = column_name[:-3]
            target = singular_to_table.get(target_hint) or singular_to_table.get(f"{target_hint}s")
            if not target or target == table_name:
                continue
            key = (table_name, target, column_name)
            if key in seen:
                continue
            seen.add(key)
            edges.append({"from": table_name, "to": target, "column": column_name})
    return edges


def _suggestions(tables: dict[str, Any], edges: list[dict[str, str]]) -> list[dict[str, str]]:
    suggestions: list[dict[str, str]] = []
    edge_columns = {(edge["from"], edge["column"]) for edge in edges}
    for table_name, table in tables.items():
        columns = table.get("columns", [])
        names = [str(column.get("name", "")) for column in columns]
        keys = [str(column.get("key", "")).upper() for column in columns]
        types = {str(column.get("name", "")): str(column.get("type", "")).lower() for column in columns}

        if "PRI" not in keys:
            suggestions.append({
                "severity": "high",
                "title": f"Add a primary key to {table_name}",
                "detail": "AI-generated updates and deletes are safer when every row has a stable primary key.",
            })
        if not any(name.endswith("_id") for name in names) and len(tables) > 1:
            suggestions.append({
                "severity": "medium",
                "title": f"Review relationships for {table_name}",
                "detail": "No relationship-style columns were detected. Add foreign keys where this table belongs to another table.",
            })
        for name in names:
            if name.endswith("_id") and (table_name, name) not in edge_columns:
                suggestions.append({
                    "severity": "medium",
                    "title": f"Confirm relationship for {table_name}.{name}",
                    "detail": "This looks like a foreign key, but QueryMind could not match it to another discovered table.",
                })
        for name, column_type in types.items():
            if name in {"email", "phone"} and column_type in {"text", "longtext"}:
                suggestions.append({
                    "severity": "low",
                    "title": f"Use a bounded type for {table_name}.{name}",
                    "detail": "Bounded varchar columns usually produce cleaner validation and better operational constraints.",
                })
    duplicates = _duplicate_column_names(tables)
    for column_name, count in duplicates.items():
        if count > 2 and column_name not in {"id", "created_at", "updated_at"}:
            suggestions.append({
                "severity": "low",
                "title": f"Standardize repeated column {column_name}",
                "detail": "Repeated business columns can be useful, but consistent naming makes AI SQL generation more reliable.",
            })
    return suggestions[:8]


def _duplicate_column_names(tables: dict[str, Any]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for table in tables.values():
        for column in table.get("columns", []):
            counter[str(column.get("name", ""))] += 1
    return counter


def _readiness_score(table_count: int, column_count: int, key_count: int, suggestions: list[dict[str, str]]) -> int:
    if table_count == 0 or column_count == 0:
        return 0
    score = 82
    score += min(10, key_count * 3)
    for suggestion in suggestions:
        if suggestion["severity"] == "high":
            score -= 18
        elif suggestion["severity"] == "medium":
            score -= 10
        else:
            score -= 5
    return max(5, min(98, score))


def _summary(score: int, table_count: int, column_count: int, relationship_count: int, suggestion_count: int) -> str:
    if table_count == 0:
        return "No schema has been discovered yet."
    if suggestion_count == 0:
        return f"Schema looks strong: {table_count} tables, {column_count} columns, and {relationship_count} inferred relationships."
    return f"Schema readiness is {score}/100 with {suggestion_count} improvement suggestion(s)."
