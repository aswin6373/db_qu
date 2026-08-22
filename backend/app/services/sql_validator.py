from dataclasses import dataclass

import sqlparse
from sqlparse.sql import Identifier, IdentifierList
from sqlparse.tokens import DML, Keyword

BLOCKED_KEYWORDS = {"DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "CREATE"}
WRITE_TYPES = {"INSERT", "UPDATE", "DELETE"}


@dataclass
class ValidationResult:
    ok: bool
    query_type: str = "unknown"
    requires_confirmation: bool = False
    error: str | None = None


def validate_sql(sql: str, schema: dict) -> ValidationResult:
    statements = [statement for statement in sqlparse.parse(sql) if str(statement).strip()]
    if len(statements) != 1:
        return ValidationResult(False, error="Only one SQL statement is allowed.")

    statement = statements[0]
    tokens = [token for token in statement.flatten() if not token.is_whitespace]
    upper_values = [token.value.upper() for token in tokens]
    if any(value in BLOCKED_KEYWORDS for value in upper_values):
        return ValidationResult(False, error="Schema and administration operations are not allowed.")

    first_dml = next((token.value.upper() for token in tokens if token.ttype is DML), "")
    if first_dml not in {"SELECT", "INSERT", "UPDATE", "DELETE"}:
        return ValidationResult(False, error="Only SELECT, INSERT, UPDATE, and DELETE are supported.")

    table_names = _extract_table_names(statement, first_dml)
    known_tables = set((schema.get("tables") or {}).keys())
    missing_tables = sorted(table_names - known_tables)
    if missing_tables:
        return ValidationResult(False, error=f"Unknown table: {', '.join(missing_tables)}")

    missing_columns = _find_missing_columns(statement, schema, table_names)
    if missing_columns:
        return ValidationResult(False, error=f"Unknown column: {', '.join(sorted(missing_columns))}")

    query_type = first_dml.lower()
    return ValidationResult(
        True,
        query_type=query_type,
        requires_confirmation=first_dml in WRITE_TYPES,
    )


def _extract_table_names(statement, dml: str) -> set[str]:
    names: set[str] = set()
    expect_next = False
    for token in statement.tokens:
        if token.is_whitespace:
            continue
        value = token.value.upper()
        if expect_next:
            names.update(_identifier_names(token))
            expect_next = False
        if value in {"FROM", "JOIN", "INTO"} or (dml == "UPDATE" and token.ttype is DML):
            expect_next = True
    return {name for name in names if name}


def _identifier_names(token) -> set[str]:
    if isinstance(token, IdentifierList):
        return {identifier.get_real_name() or "" for identifier in token.get_identifiers()}
    if isinstance(token, Identifier):
        return {token.get_real_name() or ""}
    return {token.value.strip("` ")}


def _find_missing_columns(statement, schema: dict, table_names: set[str]) -> set[str]:
    if not table_names:
        return set()
    known_columns = set()
    for table in table_names:
        for column in schema["tables"].get(table, {}).get("columns", []):
            known_columns.add(column["name"])

    missing: set[str] = set()
    for token in statement.flatten():
        value = token.value.strip("`")
        if token.ttype in Keyword or not value.isidentifier():
            continue
        if value in table_names or value.upper() in {"SELECT", "FROM", "WHERE", "AND", "OR", "SET", "VALUES"}:
            continue
        if value not in known_columns and not value.isnumeric():
            # Function names and aliases are hard to detect perfectly with sqlparse,
            # so we only enforce obvious column references.
            parent = getattr(token, "parent", None)
            if parent and isinstance(parent, Identifier):
                missing.add(value)
    return missing
