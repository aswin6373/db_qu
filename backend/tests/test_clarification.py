import json

from conftest import TestingSessionLocal
from app.core.config import get_settings
from app.models import DBConnection
from app.services.ai import evaluate_clarity

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
                {"name": "city", "type": "varchar", "key": ""},
            ]
        }
    }
}


def register_and_token(client, email: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": "Clarify Org"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_connection_with_schema(client, token: str) -> int:
    response = client.post(
        "/connections",
        json={"name": "Clarify DB", "host": "db", "port": 3306, "username": "u", "password": "p", "database_name": "d", "test_live": False},
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


def test_unclear_question_returns_clarification(client):
    token = register_and_token(client, "clarify@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    connection_id = create_connection_with_schema(client, token)
    session_id = client.post("/chat/sessions", json={}, headers=headers).json()["id"]

    asked = client.post(
        "/query/generate",
        json={"question": "show me the important stuff", "connection_id": connection_id, "session_id": session_id},
        headers=headers,
    )
    assert asked.status_code == 200
    body = asked.json()
    assert body["needs_clarification"] is True
    assert body["sql"] == ""
    assert body["query_id"] == 0
    assert "customers" in body["summary"]

    history = client.get(f"/chat/sessions/{session_id}", headers=headers).json()
    assert [message["role"] for message in history] == ["user", "assistant"]
    assert history[1]["content"] == body["summary"]
    assert history[1]["result"] is None


class FakeConnector:
    def execute(self, sql: str):
        return ["id"], [{"id": 1}]


def test_clear_question_still_executes(client, monkeypatch):
    from app.api import query as query_api

    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())
    token = register_and_token(client, "clarify-clear@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    connection_id = create_connection_with_schema(client, token)

    asked = client.post(
        "/query/generate",
        json={"question": "show me the customers", "connection_id": connection_id},
        headers=headers,
    )
    assert asked.status_code == 200
    body = asked.json()
    assert body["needs_clarification"] is False
    assert body["rows"] == [{"id": 1}]


def _with_gemini(monkeypatch, response_text: str):
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr("app.services.ai._gemini_generate", lambda prompt: response_text)


def test_evaluate_clarity_asks_when_llm_says_unclear(client, monkeypatch):
    _with_gemini(monkeypatch, '{"can_execute": false, "question": "Do you mean the customers table?"}')
    question = evaluate_clarity("fix it", SCHEMA, [])
    assert question == "Do you mean the customers table?"


def test_evaluate_clarity_proceeds_when_clear(client, monkeypatch):
    _with_gemini(monkeypatch, '{"can_execute": true}')
    assert evaluate_clarity("count rows in customers", SCHEMA, []) is None


def test_evaluate_clarity_fails_open_on_garbage(client, monkeypatch):
    _with_gemini(monkeypatch, "Sorry, I am not sure what you mean!")
    assert evaluate_clarity("anything", SCHEMA, []) is None


def test_evaluate_clarity_parses_fenced_json(client, monkeypatch):
    _with_gemini(monkeypatch, '```json\n{"can_execute": false, "question": "Which table: a or b?"}\n```')
    assert evaluate_clarity("update that one", SCHEMA, []) == "Which table: a or b?"
