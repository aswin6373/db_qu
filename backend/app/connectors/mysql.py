from typing import Any

import mysql.connector

from app.connectors.base import DBConnector
from app.core.config import get_settings


class MySQLConnector(DBConnector):
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        database_name: str,
    ) -> None:
        self.config = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "database": database_name,
            "connection_timeout": get_settings().mysql_connect_timeout,
        }
        self.database_name = database_name

    def connect(self) -> None:
        connection = mysql.connector.connect(**self.config)
        connection.close()

    def get_schema(self) -> dict[str, Any]:
        connection = mysql.connector.connect(**self.config)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
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
                }
            )
        cursor.close()
        connection.close()
        return schema

    def execute(self, sql: str) -> tuple[list[str], list[dict[str, Any]]]:
        connection = mysql.connector.connect(**self.config)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql)
        columns = list(cursor.column_names or [])
        rows = list(cursor.fetchall() or []) if cursor.with_rows else []
        connection.commit()
        cursor.close()
        connection.close()
        return columns, rows
