from typing import Any

import psycopg

from app.connectors.base import DBConnector
from app.connectors.mysql import unique_columns
from app.connectors.tunnel import SSHTunnel, TunnelledConnectorMixin
from app.core.config import get_settings


class PostgresConnector(DBConnector, TunnelledConnectorMixin):
    """Read/write access to a PostgreSQL database over psycopg.

    Mirrors MySQLConnector's contract: schema cache in the shared
    {"tables": {name: {"columns": [...]}}} shape (primary keys reported as
    "PRI", auto-incrementing columns flagged via extra="auto_increment"), row
    caps, duplicate-column suffixing, and an optional SSH tunnel.
    """

    VALID_SSL_MODES = {"PREFERRED", "REQUIRED", "DISABLED"}
    SSL_MODE_MAP = {"PREFERRED": "prefer", "REQUIRED": "require", "DISABLED": "disable"}

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        database_name: str,
        ssl_mode: str = "PREFERRED",
        ssh_host: str | None = None,
        ssh_port: int = 22,
        ssh_username: str | None = None,
        ssh_password: str | None = None,
    ) -> None:
        if ssl_mode not in self.VALID_SSL_MODES:
            raise ValueError(f"Unsupported SSL mode: {ssl_mode}")
        self.config: dict[str, Any] = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "dbname": database_name,
            "connect_timeout": get_settings().postgres_connect_timeout,
            "sslmode": self.SSL_MODE_MAP[ssl_mode],
        }
        self.statement_timeout_ms = get_settings().postgres_statement_timeout_ms
        self.database_name = database_name
        self.tunnel: SSHTunnel | None = None
        self.last_truncated = False
        if ssh_host:
            # The database host/port are dialed from the SSH server's point of view.
            self.tunnel = SSHTunnel(
                ssh_host=ssh_host,
                ssh_port=ssh_port,
                ssh_username=ssh_username,
                ssh_secret=ssh_password,
                remote_host=host,
                remote_port=port,
            )

    def close(self) -> None:
        """Tear down the shared SSH tunnel (if any). Safe to call twice."""
        self.close_tunnel()

    def connect(self) -> None:
        with self.tunneled_config() as config:
            connection = psycopg.connect(**config)
            try:
                connection.close()
            except Exception:
                pass

    def get_schema(self) -> dict[str, Any]:
        """Introspect every user table across non-system schemas.

        information_schema has no COLUMN_KEY column like MySQL, so primary keys
        come from table_constraints/key_column_usage; sequence-backed defaults
        (nextval) stand in for MySQL's auto_increment flag. Both are mapped to
        the conventions downstream layers already depend on ("PRI" keys and
        extra="auto_increment").
        """
        with self.tunneled_config() as config:
            connection = psycopg.connect(**config)
            try:
                cursor = connection.cursor()
                try:
                    cursor.execute(
                        """
                        SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                               CASE WHEN tc.CONSTRAINT_TYPE = 'PRIMARY KEY' THEN 'PRI' ELSE '' END AS COLUMN_KEY
                        FROM information_schema.COLUMNS c
                        LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
                          ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
                         AND kcu.TABLE_NAME = c.TABLE_NAME
                         AND kcu.COLUMN_NAME = c.COLUMN_NAME
                        LEFT JOIN information_schema.TABLE_CONSTRAINTS tc
                          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                         AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                         AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                        WHERE c.TABLE_SCHEMA NOT IN ('pg_catalog', 'information_schema')
                        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
                        """
                    )
                    schema: dict[str, Any] = {"tables": {}}
                    for row in cursor.fetchall():
                        (
                            table_name,
                            column_name,
                            data_type,
                            is_nullable,
                            column_default,
                            column_key,
                        ) = row
                        schema["tables"].setdefault(table_name, {"columns": []})
                        schema["tables"][table_name]["columns"].append(
                            {
                                "name": column_name,
                                "type": data_type,
                                "key": column_key or "",
                                "nullable": is_nullable == "YES",
                                "default": column_default,
                                # Sequence-backed defaults are PostgreSQL's auto-increment.
                                "extra": (
                                    "auto_increment"
                                    if isinstance(column_default, str)
                                    and "nextval(" in column_default.lower()
                                    else ""
                                ),
                            }
                        )
                finally:
                    cursor.close()
            finally:
                connection.close()
            return schema

    def execute(self, sql: str) -> tuple[list[str], list[dict[str, Any]]]:
        """Run one statement and return (columns, rows).

        Same guarantees as MySQLConnector.execute: hard row cap with a
        truncation flag, duplicate column suffixing, and a server-side
        statement timeout so runaway queries die inside PostgreSQL instead of
        hanging the worker.
        """
        self.last_truncated = False
        limit = get_settings().max_result_rows
        with self.tunneled_config() as config:
            connection = psycopg.connect(**config)
            try:
                cursor = connection.cursor()
                try:
                    if self.statement_timeout_ms > 0:
                        cursor.execute(
                            f"SET statement_timeout = {int(self.statement_timeout_ms)}"
                        )
                    cursor.execute(sql)
                    raw_columns = [str(col.name) for col in (cursor.description or [])]
                    columns = unique_columns(raw_columns)
                    rows: list[dict[str, Any]] = []
                    if cursor.description is not None:
                        batch = cursor.fetchmany(limit + 1)
                        if len(batch) > limit:
                            self.last_truncated = True
                            batch = batch[:limit]
                        rows = [dict(zip(columns, row)) for row in batch]
                    connection.commit()
                finally:
                    cursor.close()
            finally:
                connection.close()
            return columns, rows
