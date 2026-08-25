import re
from typing import Any

import mysql.connector

from app.connectors.base import DBConnector
from app.connectors.tunnel import SSHTunnel, TunnelledConnectorMixin
from app.core.config import get_settings


class MySQLConnector(DBConnector, TunnelledConnectorMixin):
    VALID_SSL_MODES = {"PREFERRED", "REQUIRED", "DISABLED"}

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
            "database": database_name,
            "connection_timeout": get_settings().mysql_connect_timeout,
        }
        self.statement_timeout_ms = get_settings().mysql_statement_timeout_ms
        if ssl_mode == "DISABLED":
            self.config["ssl_disabled"] = True
        elif ssl_mode == "REQUIRED":
            self.config["ssl_mode"] = "REQUIRED"
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
            connection = mysql.connector.connect(**config)
            try:
                connection.close()
            except Exception:
                pass

    def get_schema(self) -> dict[str, Any]:
        with self.tunneled_config() as config:
            connection = mysql.connector.connect(**config)
            try:
                cursor = connection.cursor(dictionary=True)
                try:
                    cursor.execute(
                        """
                        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = %s
                        ORDER BY TABLE_NAME, ORDINAL_POSITION
                        """,
                        (self.database_name,),
                    )
                    schema: dict[str, Any] = {"tables": {}}
                    for row in cursor.fetchall():
                        table = row["TABLE_NAME"]
                        schema["tables"].setdefault(table, {"columns": []})
                        schema["tables"][table]["columns"].append(
                            {
                                "name": row["COLUMN_NAME"],
                                "type": row["DATA_TYPE"],
                                "key": row["COLUMN_KEY"] or "",
                                "nullable": row["IS_NULLABLE"] == "YES",
                                "default": row["COLUMN_DEFAULT"],
                                "extra": row["EXTRA"] or "",
                            }
                        )
                finally:
                    cursor.close()
            finally:
                connection.close()
            return schema

    def _with_execution_cap(self, sql: str) -> str:
        """Server-side runtime cap for SELECTs. A runaway query (or a SLEEP-style
        probe that slipped past validation) is killed by MySQL itself instead of
        hanging the worker. MAX_EXECUTION_TIME applies to SELECT only."""
        if self.statement_timeout_ms <= 0:
            return sql
        return re.sub(
            r"^(\s*)SELECT\b",
            rf"\1SELECT /*+ MAX_EXECUTION_TIME({self.statement_timeout_ms}) */",
            sql,
            count=1,
            flags=re.IGNORECASE,
        )

    def execute(self, sql: str) -> tuple[list[str], list[dict[str, Any]]]:
        """Run one statement and return (columns, rows).

        Rows are hard-capped at settings.max_result_rows — an un-limited
        SELECT * on a huge table must never be materialized into memory or
        serialized into a response. Duplicate column names (unavoidable with
        SELECT a.id, b.id) are suffixed (_2, _3, …) so downstream dict-based
        rows keep every value instead of silently collapsing columns.
        """
        self.last_truncated = False
        limit = get_settings().max_result_rows
        with self.tunneled_config() as config:
            connection = mysql.connector.connect(**config)
            try:
                # Tuple cursor: dict cursors collapse duplicate column names
                # (SELECT a.id, b.id) before we can keep both values.
                cursor = connection.cursor()
                try:
                    cursor.execute(self._with_execution_cap(sql))
                    raw_columns = [str(name) for name in (cursor.column_names or [])]
                    columns = unique_columns(raw_columns)
                    rows: list[dict[str, Any]] = []
                    if cursor.with_rows:
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


def unique_columns(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for column in columns:
        count = seen.get(column, 0) + 1
        seen[column] = count
        result.append(column if count == 1 else f"{column}_{count}")
    return result
