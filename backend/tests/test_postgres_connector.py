from unittest.mock import patch

import pytest

from app.api.connections import build_connector
from app.connectors.mysql import MySQLConnector
from app.connectors.postgres import PostgresConnector
from app.core.config import get_settings
from app.models import DBConnection
from app.services.crypto import encrypt_secret


class FakeCursor:
    def __init__(self, schema_rows=None, result_columns=None, result_rows=None):
        self.schema_rows = schema_rows or []
        self.result_columns = result_columns or []
        self.result_rows = result_rows or []
        self.executed: list[str] = []

    def execute(self, sql, params=None):
        self.executed.append(sql)

    def fetchall(self):
        return self.schema_rows

    def fetchmany(self, size):
        return self.result_rows[:size]

    @property
    def description(self):
        if not self.result_columns:
            return None
        from types import SimpleNamespace

        return [SimpleNamespace(name=name) for name in self.result_columns]

    def close(self):
        pass


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def commit(self):
        pass

    def close(self):
        pass


def make_connector(**overrides) -> PostgresConnector:
    kwargs = {"host": "h", "port": 5432, "username": "u", "password": "p", "database_name": "db"}
    kwargs.update(overrides)
    return PostgresConnector(**kwargs)


def test_ssl_mode_mapping():
    assert make_connector().config["sslmode"] == "prefer"
    assert make_connector(ssl_mode="REQUIRED").config["sslmode"] == "require"
    assert make_connector(ssl_mode="DISABLED").config["sslmode"] == "disable"


def test_invalid_ssl_mode_is_rejected():
    with pytest.raises(ValueError):
        make_connector(ssl_mode="SOMETING_ELSE")


def test_ssh_tunnel_is_created_but_not_opened():
    connector = make_connector(ssh_host="bastion", ssh_port=2222, ssh_username="ec2-user", ssh_password="secret")
    assert connector.tunnel is not None
    assert connector.tunnel.transport is None
    assert connector.tunnel.remote_port == 5432


def test_get_schema_maps_pg_metadata_to_shared_conventions():
    cursor = FakeCursor(
        schema_rows=[
            ("users", "id", "integer", "NO", "nextval('users_id_seq'::regclass)", "PRI"),
            ("users", "email", "character varying", "YES", None, ""),
            ("orders", "id", "integer", "NO", None, "PRI"),
            ("orders", "user_id", "integer", "YES", None, ""),
        ]
    )
    connector = make_connector()
    with patch("app.connectors.postgres.psycopg.connect", return_value=FakeConnection(cursor)):
        schema = connector.get_schema()

    id_column = schema["tables"]["users"]["columns"][0]
    assert id_column == {
        "name": "id",
        "type": "integer",
        "key": "PRI",
        "nullable": False,
        "default": "nextval('users_id_seq'::regclass)",
        "extra": "auto_increment",
    }
    email_column = schema["tables"]["users"]["columns"][1]
    assert email_column["key"] == ""
    assert email_column["nullable"] is True
    assert email_column["extra"] == ""
    assert set(schema["tables"].keys()) == {"users", "orders"}


def test_execute_applies_statement_timeout_and_caps_rows(monkeypatch):
    monkeypatch.setenv("MAX_RESULT_ROWS", "2")
    get_settings.cache_clear()
    try:
        cursor = FakeCursor(
            result_columns=["id"],
            result_rows=[(1,), (2,), (3,), (4,)],
        )
        connector = make_connector()
        with patch("app.connectors.postgres.psycopg.connect", return_value=FakeConnection(cursor)):
            columns, rows = connector.execute("SELECT id FROM users")

        assert columns == ["id"]
        assert rows == [{"id": 1}, {"id": 2}]
        assert connector.last_truncated is True
        assert any("SET statement_timeout" in sql for sql in cursor.executed)
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_execute_suffixes_duplicate_column_names():
    cursor = FakeCursor(
        result_columns=["id", "id"],
        result_rows=[(1, 2)],
    )
    connector = make_connector()
    with patch("app.connectors.postgres.psycopg.connect", return_value=FakeConnection(cursor)):
        columns, rows = connector.execute("SELECT a.id, b.id FROM a JOIN b ON a.id = b.id")

    assert columns == ["id", "id_2"]
    assert rows == [{"id": 1, "id_2": 2}]


def test_execute_skips_timeout_when_disabled(monkeypatch):
    monkeypatch.setenv("POSTGRES_STATEMENT_TIMEOUT_MS", "0")
    get_settings.cache_clear()
    try:
        cursor = FakeCursor(result_columns=["id"], result_rows=[(1,)])
        connector = make_connector()
        with patch("app.connectors.postgres.psycopg.connect", return_value=FakeConnection(cursor)):
            connector.execute("SELECT id FROM users")
        assert all("statement_timeout" not in sql for sql in cursor.executed)
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_factory_dispatches_by_db_type():
    password = encrypt_secret("p")
    mysql_row = DBConnection(
        organization_id=1,
        name="m",
        db_type="mysql",
        host="h",
        port=3306,
        username="u",
        encrypted_password=password,
        database_name="d",
    )
    postgres_row = DBConnection(
        organization_id=1,
        name="p",
        db_type="postgres",
        host="h",
        port=5432,
        username="u",
        encrypted_password=password,
        database_name="d",
    )
    legacy_row = DBConnection(
        organization_id=1,
        name="l",
        db_type="",
        host="h",
        port=3306,
        username="u",
        encrypted_password=password,
        database_name="d",
    )

    assert isinstance(build_connector(mysql_row), MySQLConnector)
    assert isinstance(build_connector(postgres_row), PostgresConnector)
    # Rows predating the db_type column stay on MySQL.
    assert isinstance(build_connector(legacy_row), MySQLConnector)


def test_create_connection_persists_db_type(client):
    response = client.post(
        "/auth/register",
        json={"email": "pg-org@example.com", "password": "password123", "organization_name": "Org PG"},
    )
    token = response.json()["access_token"]

    created = client.post(
        "/connections",
        json={
            "name": "Analytics PG",
            "db_type": "postgres",
            "host": "pg.example.com",
            "port": 5432,
            "username": "u",
            "password": "p",
            "database_name": "analytics",
            "test_live": False,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["db_type"] == "postgres"

    listed = client.get("/connections", headers={"Authorization": f"Bearer {token}"})
    assert listed.json()[0]["db_type"] == "postgres"
