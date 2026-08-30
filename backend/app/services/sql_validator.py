import re

import sqlparse
from sqlparse.sql import Function, Identifier, IdentifierList, Parenthesis
from sqlparse.tokens import DML, Keyword
from dataclasses import dataclass

BLOCKED_KEYWORDS = {"DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "CREATE"}
# Dangerous server-side functions: denylist blocks time-based attacks (SLEEP,
# BENCHMARK, PG_SLEEP), privileged file reads (LOAD_FILE, PG_READ_FILE), remote
# execution surfaces (DBLINK), and extension loading — even when the statement
# otherwise looks like a plain SELECT.
BLOCKED_FUNCTIONS = {
    "SLEEP",
    "BENCHMARK",
    "LOAD_FILE",
    "GET_LOCK",
    "RELEASE_LOCK",
    "PG_SLEEP",
    "PG_READ_FILE",
    "PG_LS_DIR",
    "DBLINK",
    "LOAD_EXTENSION",
}
WRITE_TYPES = {"INSERT", "UPDATE", "DELETE"}
SYSTEM_TABLES = {
    "information_schema",
    "performance_schema",
    "mysql",
    "sys",
    "pg_catalog",
    "pg_toast",
}
# MySQL executes the contents of version-comment directives (/*! ... */) and
# optimizer hints (/*+ ... */). Regular comments are inert, but they can hide
# keywords from a naive token scan, so validation always runs on a
# comment-stripped copy while executable comments are rejected outright.
EXECUTABLE_COMMENT_RE = re.compile(r"/\*[*!+]")


@dataclass
class ValidationResult:
    ok: bool
    query_type: str = "unknown"
    requires_confirmation: bool = False
    error: str | None = None


def validate_sql(sql: str, schema: dict) -> ValidationResult:
    if EXECUTABLE_COMMENT_RE.search(sql):
        return ValidationResult(False, error="Comment directives are not allowed.")

    # Validate the statement as MySQL will actually parse it — with every
    # inert comment removed so payloads cannot hide inside comment tokens.
    cleaned = sqlparse.format(sql, strip_comments=True).strip()
    if not cleaned:
        return ValidationResult(False, error="The statement is empty.")
    statements = [statement for statement in sqlparse.parse(cleaned) if str(statement).strip()]
    if len(statements) != 1:
        return ValidationResult(False, error="Only one SQL statement is allowed.")

    statement = statements[0]
    tokens = [token for token in statement.flatten() if not token.is_whitespace]

    # Only classify real SQL keywords — an identifier or literal that happens to
    # spell a banned word must not be rejected.
    keyword_values = [token.value.upper() for token in tokens if token.ttype in Keyword]
    if any(value in BLOCKED_KEYWORDS for value in keyword_values):
        return ValidationResult(False, error="Schema and administration operations are not allowed.")
    blocked_function = _blocked_function(cleaned)
    if blocked_function:
        return ValidationResult(False, error=f"Function {blocked_function} is not allowed.")

    first_dml = next((token.value.upper() for token in tokens if token.ttype is DML), "")
    if first_dml not in {"SELECT", "INSERT", "UPDATE", "DELETE"}:
        return ValidationResult(False, error="Only SELECT, INSERT, UPDATE, and DELETE are supported.")
    if first_dml in {"UPDATE", "DELETE"} and not _has_outer_where(statement):
        return ValidationResult(
            False,
            error="UPDATE and DELETE need a WHERE clause that limits which rows change.",
        )

    table_names = _extract_table_names(statement, first_dml)
    system = sorted(table_names & SYSTEM_TABLES)
    if system:
        return ValidationResult(False, error="System tables are not accessible.")
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


def _blocked_function(sql_text: str) -> str | None:
    """Detect denylisted function calls even when written as `sleep`(5) or
    SLEEP(5). Runs against the raw statement text so grouping cannot hide it.
    Accepts MySQL backtick and PostgreSQL double-quote identifier quoting."""
    for match in re.finditer(r'[`"\']?\b([a-zA-Z_]\w*)\b[`"\']?\s*\(', sql_text):
        name = match.group(1).upper()
        if name in BLOCKED_FUNCTIONS:
            return name
    return None


def _has_outer_where(statement) -> bool:
    """True only when WHERE appears at the statement's top level. A WHERE
    buried inside a subquery must not satisfy an UPDATE/DELETE row guard."""
    def walk(node) -> bool:
        for child in getattr(node, "tokens", []):
            if isinstance(child, Parenthesis):
                continue
            if child.ttype in Keyword and child.value.upper() == "WHERE":
                return True
            if hasattr(child, "tokens") and walk(child):
                return True
        return False

    return walk(statement)


def extract_table_names(sql: str) -> list[str]:
    """Best-effort table names referenced by a statement, for the audit log.

    Never raises - a parse quirk must not break query logging. Capped at 10
    names so pathological SQL cannot bloat the log row."""
    try:
        cleaned = sqlparse.format(sql, strip_comments=True).strip()
        statements = [statement for statement in sqlparse.parse(cleaned) if str(statement).strip()]
        if not statements:
            return []
        statement = statements[0]
        dml = next((token.value.upper() for token in statement.flatten() if token.ttype is DML), "")
        return sorted(_extract_table_names(statement, dml))[:10]
    except Exception:
        return []


def _extract_table_names(statement, dml: str = "") -> set[str]:
    names: set[str] = set()
    cte_names: set[str] = set()

    # Collect CTE names if any (WITH cte_name AS (...))
    expect_cte = False
    for token in getattr(statement, "tokens", []):
        if token.is_whitespace:
            continue
        val = token.value.upper()
        if val == "WITH":
            expect_cte = True
            continue
        if expect_cte:
            if isinstance(token, IdentifierList):
                for id_tok in token.get_identifiers():
                    if isinstance(id_tok, Identifier):
                        cte_names.add(_clean_identifier_name(id_tok.get_real_name() or id_tok.value).lower())
            elif isinstance(token, Identifier):
                cte_names.add(_clean_identifier_name(token.get_real_name() or token.value).lower())
            expect_cte = False

    def walk_statement(node, node_dml=""):
        expect_next = False
        for token in getattr(node, "tokens", []):
            if token.is_whitespace:
                continue
            val = token.value.upper()

            # Recurse into parenthesis or subqueries
            if isinstance(token, Parenthesis):
                walk_statement(token, node_dml="SELECT")

            if expect_next:
                _process_from_target(token, names)
                expect_next = False

            if val in {"FROM", "JOIN", "INTO"} or (node_dml == "UPDATE" and token.ttype is DML):
                expect_next = True
            elif hasattr(token, "tokens") and not isinstance(token, (Identifier, IdentifierList)):
                walk_statement(token, node_dml=node_dml if val == "UPDATE" else "")

    walk_statement(statement, dml)
    return {name for name in names if name and name.lower() not in cte_names}


def _process_from_target(token, names: set[str]) -> None:
    if isinstance(token, IdentifierList):
        for id_tok in token.get_identifiers():
            _process_single_from_target(id_tok, names)
    else:
        _process_single_from_target(token, names)


def _is_subquery_node(node) -> bool:
    if not isinstance(node, Parenthesis):
        return False
    return any(t.value.upper() == "SELECT" for t in node.flatten() if not t.is_whitespace)


def _process_single_from_target(token, names: set[str]) -> None:
    # If the target contains a subquery parenthesis (e.g. `(SELECT ...) AS cust`)
    has_subquery = False
    for sub in getattr(token, "tokens", []):
        if _is_subquery_node(sub):
            has_subquery = True
            _extract_subquery_tables(sub, "SELECT", names)

    if _is_subquery_node(token):
        has_subquery = True
        _extract_subquery_tables(token, "SELECT", names)

    if not has_subquery:
        real_name = None
        if isinstance(token, Identifier):
            real_name = token.get_real_name()
            if not real_name:
                val = token.value.strip()
                parts = re.split(r"\s+(?:AS\s+)?", val, maxsplit=1, flags=re.IGNORECASE)
                real_name = parts[0]
        elif getattr(token, "ttype", None) is not None or hasattr(token, "value"):
            val = str(token.value).strip()
            parts = re.split(r"\s+(?:AS\s+)?", val, maxsplit=1, flags=re.IGNORECASE)
            real_name = parts[0]

        if real_name:
            cleaned = _clean_identifier_name(real_name)
            if cleaned and not cleaned.startswith("("):
                names.add(cleaned)


def _extract_subquery_tables(parenthesis_node, dml: str, names: set[str]) -> None:
    expect_next = False
    for token in getattr(parenthesis_node, "tokens", []):
        if token.is_whitespace:
            continue
        val = token.value.upper()
        if _is_subquery_node(token):
            _extract_subquery_tables(token, "SELECT", names)
        if expect_next:
            _process_from_target(token, names)
            expect_next = False
        if val in {"FROM", "JOIN", "INTO"} or (dml == "UPDATE" and token.ttype is DML):
            expect_next = True
        elif hasattr(token, "tokens") and not isinstance(token, (Identifier, IdentifierList)):
            _extract_subquery_tables(token, dml, names)


def _clean_identifier_name(value: str) -> str:
    name = value.split("(", 1)[0].strip("`\" ")
    # Qualifiers like otherdb.customers are rejected via the unknown-table
    # check; keep only the trailing identifier part so the comparison is
    # deliberate instead of accidental. Strips both MySQL backticks and
    # PostgreSQL double quotes.
    return name.rsplit(".", 1)[-1].split("(", 1)[0].strip("`\" ") if "." in name else name


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
                    aliases.add(alias.strip("`\" ").lower())
            elif isinstance(child, IdentifierList):
                for id_tok in child.get_identifiers():
                    if isinstance(id_tok, Identifier):
                        alias = id_tok.get_alias()
                        if alias:
                            aliases.add(alias.strip("`\" ").lower())
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
        value = token.value.strip("`\"")
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
