import json

from conftest import TestingSessionLocal
from app.models import DBConnection

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
            ]
        }
    }
}


def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_connection_with_schema(client, token: str, name: str) -> int:
    response = client.post(
        "/connections",
        json={"name": name, "host": "db", "port": 3306, "username": "u", "password": "p", "database_name": "d", "test_live": False},
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


class FakeConnector:
    def execute(self, sql: str):
        return ["id"], [{"id": 1}]

    def close(self):
        pass


def test_chat_session_lifecycle_and_message_persistence(client, monkeypatch):
    from app.api import query as query_api

    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())
    token = register_and_token(client, "chat@example.com", "Chat Org")
    headers = {"Authorization": f"Bearer {token}"}
    connection_id = create_connection_with_schema(client, token, "Chat DB")

    created = client.post("/chat/sessions", json={}, headers=headers)
    assert created.status_code == 200
    session_id = created.json()["id"]
    assert created.json()["title"] == "New chat"
    assert created.json()["message_count"] == 0

    asked = client.post(
        "/query/generate",
        json={"question": "show me the customers", "connection_id": connection_id, "session_id": session_id},
        headers=headers,
    )
    assert asked.status_code == 200
    query_id = asked.json()["query_id"]

    sessions = client.get("/chat/sessions", headers=headers)
    assert sessions.status_code == 200
    listing = sessions.json()
    assert len(listing) == 1
    assert listing[0]["id"] == session_id
    assert listing[0]["message_count"] == 2
    assert listing[0]["title"] == "show me the customers"

    history = client.get(f"/chat/sessions/{session_id}", headers=headers)
    assert history.status_code == 200
    messages = history.json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "show me the customers"
    assert messages[1]["query_id"] == query_id
    assert messages[1]["sql"] == asked.json()["sql"]
    assert messages[1]["result"]["summary"] == asked.json()["summary"]
    assert messages[1]["result"]["rows"] == [{"id": 1}]

    renamed = client.patch(f"/chat/sessions/{session_id}", json={"title": "Customer research"}, headers=headers)
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Customer research"

    empty_rename = client.patch(f"/chat/sessions/{session_id}", json={"title": "   "}, headers=headers)
    assert empty_rename.status_code == 400

    deleted = client.delete(f"/chat/sessions/{session_id}", headers=headers)
    assert deleted.status_code == 204

    sessions_after = client.get("/chat/sessions", headers=headers)
    assert sessions_after.json() == []
    assert client.get(f"/chat/sessions/{session_id}", headers=headers).status_code == 404


def test_chat_sessions_are_isolated_per_organization(client):
    first_token = register_and_token(client, "chat-org1@example.com", "Chat Org 1")
    second_token = register_and_token(client, "chat-org2@example.com", "Chat Org 2")

    created = client.post("/chat/sessions", json={"title": "Private notes"}, headers={"Authorization": f"Bearer {first_token}"})
    assert created.status_code == 200
    session_id = created.json()["id"]

    foreign = client.get(f"/chat/sessions/{session_id}", headers={"Authorization": f"Bearer {second_token}"})
    assert foreign.status_code == 404

    foreign_rename = client.patch(
        f"/chat/sessions/{session_id}",
        json={"title": "hijacked"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert foreign_rename.status_code == 404

    foreign_delete = client.delete(f"/chat/sessions/{session_id}", headers={"Authorization": f"Bearer {second_token}"})
    assert foreign_delete.status_code == 404

    owner_list = client.get("/chat/sessions", headers={"Authorization": f"Bearer {first_token}"})
    assert [session["id"] for session in owner_list.json()] == [session_id]


def test_write_query_confirmation_persists_follow_up(client, monkeypatch):
    from app.api import query as query_api

    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())
    token = register_and_token(client, "chat-write@example.com", "Chat Write Org")
    headers = {"Authorization": f"Bearer {token}"}
    connection_id = create_connection_with_schema(client, token, "Write DB")

    session = client.post("/chat/sessions", json={}, headers=headers)
    session_id = session.json()["id"]

    asked = client.post(
        "/query/generate",
        json={"question": "delete customer rows", "connection_id": connection_id, "session_id": session_id},
        headers=headers,
    )
    assert asked.status_code == 200
    assert asked.json()["requires_confirmation"] is True

    history = client.get(f"/chat/sessions/{session_id}", headers=headers)
    assert len(history.json()) == 2

    confirmed = client.post(f"/query/{asked.json()['query_id']}/confirm", headers=headers)
    assert confirmed.status_code == 200

    history = client.get(f"/chat/sessions/{session_id}", headers=headers)
    messages = history.json()
    assert len(messages) == 3
    assert messages[1]["result"]["requires_confirmation"] is False
    assert messages[2]["role"] == "assistant"
    assert messages[2]["result"]["rows"] == [{"id": 1}]
