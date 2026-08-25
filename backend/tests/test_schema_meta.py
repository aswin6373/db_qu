import json

from conftest import TestingSessionLocal
from app.models import DBConnection

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
                {"name": "email", "type": "varchar", "key": ""},
            ]
        },
        "orders": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "customer_id", "type": "int", "key": "MUL"},
                {"name": "total", "type": "decimal", "key": ""},
            ]
        },
    }
}


def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_connection_with_schema(client, token: str) -> int:
    response = client.post(
        "/connections",
        json={"name": "Meta DB", "host": "db", "port": 3306, "username": "u", "password": "p", "database_name": "d", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    connection_id = response.json()["id"]
    db = TestingSessionLocal()
    try:
        connection = db.get(DBConnection, connection_id)
        connection.schema_cache = json.dumps(SCHEMA)
        db.commit()
    finally:
        db.close()
    return connection_id


def ask(client, token: str, connection_id: int, question: str) -> dict:
    response = client.post(
        "/query/generate",
        json={"question": question, "connection_id": connection_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_table_names_answered_directly(client):
    token = register_and_token(client, "meta-tables@example.com", "Meta Tables")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "give me the tables names in the database")
    assert result["meta_answer"] is True
    assert result["sql"] == ""
    assert "customers" in result["summary"]
    assert "orders" in result["summary"]


def test_column_names_answered_for_all_tables_with_typo(client):
    token = register_and_token(client, "meta-cols@example.com", "Meta Cols")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "give me all tables columan names okay")
    assert result["meta_answer"] is True
    assert result["sql"] == ""
    assert "customer_id" in result["summary"]
    assert "email" in result["summary"]


def test_columns_for_one_table(client):
    token = register_and_token(client, "meta-one@example.com", "Meta One")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "what columns does orders have")
    assert result["meta_answer"] is True
    assert "orders" in result["summary"]
    assert "total" in result["summary"]
    assert "email" not in result["summary"]


class FakeConnector:
    def execute(self, sql: str):
        return ["id"], [{"id": 1}]


def test_real_data_question_still_generates_sql(client, monkeypatch):
    from app.api import query as query_api

    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())
    token = register_and_token(client, "meta-data@example.com", "Meta Data")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "show all rows from orders")
    assert result["meta_answer"] is False
    assert result["sql"] != ""


def test_data_request_with_superlatives_not_answered_from_schema():
    from app.services.ai import schema_meta_answer

    assert schema_meta_answer("Show the 10 most recent rows from my biggest table", SCHEMA) is None
    assert schema_meta_answer("show the latest records", SCHEMA) is None
    assert schema_meta_answer("top 5 largest entries", SCHEMA) is None
    # Genuine schema questions still get the direct answer.
    assert schema_meta_answer("what tables do I have", SCHEMA) is not None
    assert schema_meta_answer("what columns does orders have", SCHEMA) is not None


def test_recent_rows_request_goes_to_sql_pipeline(client, monkeypatch):
    from app.api import query as query_api
    from app.services import ai as ai_service

    def fake_gemini(prompt, eff=None):
        return "SELECT * FROM customers LIMIT 10"

    monkeypatch.setattr(ai_service, "_gemini_generate", fake_gemini)
    monkeypatch.setattr(
        ai_service,
        "get_settings",
        lambda: __import__("types").SimpleNamespace(
            llm_provider="gemini",
            gemini_api_key="test",
            gemini_model="test",
            ollama_base_url="http://localhost",
            ollama_model="test",
        ),
    )
    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())
    token = register_and_token(client, "meta-recent@example.com", "Meta Recent")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "Show the 10 most recent rows from my biggest table")
    assert result["meta_answer"] is False
    assert result["needs_clarification"] is False
    assert result["sql"] != ""


def test_system_table_queries_get_friendly_error(client, monkeypatch):
    from app.services import ai as ai_service

    def fake_gemini(prompt, eff=None):
        return "SELECT table_name FROM information_schema.tables"

    monkeypatch.setattr(ai_service, "_gemini_generate", fake_gemini)
    monkeypatch.setattr(
        ai_service,
        "get_settings",
        lambda: __import__("types").SimpleNamespace(
            llm_provider="gemini",
            gemini_api_key="test",
            gemini_model="test",
            ollama_base_url="http://localhost",
            ollama_model="test",
        ),
    )

    token = register_and_token(client, "meta-sys@example.com", "Meta Sys")
    connection_id = create_connection_with_schema(client, token)

    result = ask(client, token, connection_id, "run a select against information_schema.tables for me")
    assert result["needs_clarification"] is True
    assert "system tables" in result["summary"]
