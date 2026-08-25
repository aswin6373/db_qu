from dataclasses import dataclass

import sqlparse
from sqlparse.sql import Function, Identifier, IdentifierList
from sqlparse.tokens import DML, Keyword

BLOCKED_KEYWORDS = {"DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "CREATE"}
# Dangerous server-side functions: denylist blocks time-based attacks (SLEEP,
# BENCHMARK), privileged file reads (LOAD_FILE), and lock tampering even when
# the statement otherwise looks like a plain SELECT.
BLOCKED_FUNCTIONS = {"SLEEP", "BENCHMARK", "LOAD_FILE", "GET_LOCK", "RELEASE_LOCK"}
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

    # Only classify real SQL keywords — an identifier or literal that happens to
    # spell a banned word must not be rejected.
    keyword_values = [token.value.upper() for token in tokens if token.ttype in Keyword]
    if any(value in BLOCKED_KEYWORDS for value in keyword_values):
        return ValidationResult(False, error="Schema and administration operations are not allowed.")
    blocked_function = _blocked_function(tokens)
    if blocked_function:
        return ValidationResult(False, error=f"Function {blocked_function} is not allowed.")

    first_dml = next((token.value.upper() for token in tokens if token.ttype is DML), "")
    if first_dml not in {"SELECT", "INSERT", "UPDATE", "DELETE"}:
        return ValidationResult(False, error="Only SELECT, INSERT, UPDATE, and DELETE are supported.")
    if first_dml in {"UPDATE", "DELETE"} and not _has_where_clause(keyword_values):
        return ValidationResult(
            False,
            error="UPDATE and DELETE need a WHERE clause that limits which rows change.",
        )

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


def _blocked_function(tokens) -> str | None:
    for index, token in enumerate(tokens):
        upper = token.value.upper()
        if upper in BLOCKED_FUNCTIONS:
            following = tokens[index + 1] if index + 1 < len(tokens) else None
            if following is not None and str(following.value).startswith("("):
                return upper
    return None


def _has_where_clause(keyword_values: list[str]) -> bool:
    return "WHERE" in keyword_values


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
        return {_clean_identifier_name(identifier.get_real_name() or identifier.value) for identifier in token.get_identifiers()}
    if isinstance(token, Identifier):
        return {_clean_identifier_name(token.get_real_name() or token.value)}
    return {_clean_identifier_name(token.value)}


def _clean_identifier_name(value: str) -> str:
    return value.split("(", 1)[0].strip("` ")


def _collect_function_names(statement) -> set[str]:
    names: set[str] = set()

    def walk(node):
        for child in getattr(node, "tokens", []):
            if isinstance(child, Function):
                name = child.get_real_name()
                if name:
                    names.add(name.lower())
            walk(child)

    walk(statement)
    return names


def _collect_aliases(statement) -> set[str]:
    aliases: set[str] = set()

    def walk(node):
        for child in getattr(node, "tokens", []):
            if isinstance(child, Identifier):
                alias = child.get_alias()
                if alias:
                    aliases.add(alias.lower())
            walk(child)

    walk(statement)
    return aliases


def _find_missing_columns(statement, schema: dict, table_names: set[str]) -> set[str]:
    if not table_names:
        return set()
    known_columns = set()
    for table in table_names:
        for column in schema["tables"].get(table, {}).get("columns", []):
            known_columns.add(column["name"])

    aliases = _collect_aliases(statement)
    functions = _collect_function_names(statement)

    missing: set[str] = set()
    for token in statement.flatten():
        value = token.value.strip("`")
        if token.ttype in Keyword or not value.isidentifier():
            continue
        if (
            value in table_names
            or value.lower() in aliases
            or value.lower() in functions
            or value.upper() in {"ON", "SELECT", "FROM", "WHERE", "AND", "OR", "SET", "VALUES"}
        ):
            continue
        if value not in known_columns and not value.isnumeric():
            # Function names and aliases are hard to detect perfectly with sqlparse,
            # so we only enforce obvious column references.
            parent = getattr(token, "parent", None)
            if parent and isinstance(parent, Identifier):
                missing.add(value)
    return missing
