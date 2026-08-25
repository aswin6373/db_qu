import json

from conftest import TestingSessionLocal
from app.models import DBConnection, Message

SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
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
        json={"name": "Agent DB", "host": "db", "port": 3306, "username": "u", "password": "p", "database_name": "d", "test_live": False},
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


class RecordingConnector:
    calls: list[str] = []

    def execute(self, sql: str):
        RecordingConnector.calls.append(sql)
        return ["customer_id", "spent"], [{"customer_id": 1, "spent": 500}]

    def close(self):
        pass


def patch_agent_llm(monkeypatch, script: list[str]):
    from app.services import agent as agent_service

    queue = list(script)
    monkeypatch.setattr(agent_service, "_agent_generate", lambda prompt, eff: queue.pop(0))


def enable_agent(monkeypatch):
    """Force agent mode on (tests run with LLM_PROVIDER=fallback otherwise)."""
    from types import SimpleNamespace

    from app.api import query as query_api
    from app.services import agent as agent_service

    monkeypatch.setattr(agent_service, "_effective_ai", lambda cfg: SimpleNamespace(provider="gemini"))
    monkeypatch.setattr(query_api, "agent_supported", lambda cfg: True)


def action(tool: str, tool_input: str = "", **extra) -> str:
    payload = {"action": {"tool": tool, "input": tool_input}}
    payload["action"].update(extra)
    return json.dumps(payload)


def test_agent_multistep_flow(client, monkeypatch):
    from app.api import query as query_api

    enable_agent(monkeypatch)

    RecordingConnector.calls = []
    monkeypatch.setattr(query_api, "build_connector", lambda connection: RecordingConnector())
    patch_agent_llm(
        monkeypatch,
        [
            action("get_columns", "orders"),
            action("run_sql", "SELECT customer_id, SUM(total) AS spent FROM orders GROUP BY customer_id ORDER BY spent DESC LIMIT 1"),
            action("finish", sql="SELECT customer_id, SUM(total) AS spent FROM orders GROUP BY customer_id ORDER BY spent DESC LIMIT 1", summary="Customer #1 spent the most, with 500 in orders."),
        ],
    )

    token = register_and_token(client, "agent-flow@example.com", "Agent Flow")
    connection_id = create_connection_with_schema(client, token)
    response = client.post(
        "/query/generate",
        json={"question": "Which customer spent the most?", "connection_id": connection_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()

    # The agent ran: inspect -> query -> finish
    assert [step["tool"] for step in body["steps"]] == ["get_columns", "run_sql", "finish"]
    assert body["steps"][0]["tool"] == "get_columns"
    assert body["sql"].startswith("SELECT customer_id")
    assert body["rows"] == [{"customer_id": 1, "spent": 500}]
    assert "Customer #1" in body["summary"]
    assert body["query_id"] > 0

    # The exchange (with steps) is persisted in the chat-less query log path
    assert body["meta_answer"] is False


def test_agent_self_heals_from_bad_sql(client, monkeypatch):
    from app.api import query as query_api

    enable_agent(monkeypatch)

    RecordingConnector.calls = []
    monkeypatch.setattr(query_api, "build_connector", lambda connection: RecordingConnector())
    patch_agent_llm(
        monkeypatch,
        [
            action("run_sql", "SELECT custmr_id FROM orders LIMIT 1"),  # invalid column
            action("run_sql", "SELECT customer_id FROM orders LIMIT 1"),  # corrected
            action("finish", sql="SELECT customer_id FROM orders LIMIT 1", summary="Found one order row."),
        ],
    )

    token = register_and_token(client, "agent-heal@example.com", "Agent Heal")
    connection_id = create_connection_with_schema(client, token)
    response = client.post(
        "/query/generate",
        json={"question": "Why do orders vary? Show me one.", "connection_id": connection_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()

    error_steps = [step for step in body["steps"] if step.get("error")]
    assert len(error_steps) == 1
    assert "custmr_id" in error_steps[0]["sql"]
    assert RecordingConnector.calls == ["SELECT customer_id FROM orders LIMIT 1"]
    assert body["summary"] == "Found one order row."


def test_agent_refuses_writes(client, monkeypatch):
    from app.api import query as query_api

    enable_agent(monkeypatch)

    RecordingConnector.calls = []
    monkeypatch.setattr(query_api, "build_connector", lambda connection: RecordingConnector())
    patch_agent_llm(
        monkeypatch,
        [
            action("run_sql", "DELETE FROM orders WHERE id = 1"),
            action("finish", sql="", summary="I can only read data; deletes are not allowed."),
        ],
    )

    token = register_and_token(client, "agent-write@example.com", "Agent Write")
    connection_id = create_connection_with_schema(client, token)
    response = client.post(
        "/query/generate",
        json={"question": "Which orders should I clean up most urgently?", "connection_id": connection_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()

    blocked = [step for step in body["steps"] if step.get("error")]
    assert any("Only SELECT" in (step.get("detail") or "") for step in blocked)
    assert RecordingConnector.calls == []  # the DELETE never reached the database


def test_agent_steps_survive_session_reload(client, monkeypatch):
    from app.api import query as query_api

    enable_agent(monkeypatch)

    RecordingConnector.calls = []
    monkeypatch.setattr(query_api, "build_connector", lambda connection: RecordingConnector())
    patch_agent_llm(
        monkeypatch,
        [
            action("get_columns", "orders"),
            action("run_sql", "SELECT customer_id, SUM(total) AS spent FROM orders GROUP BY customer_id ORDER BY spent DESC LIMIT 1"),
            action("finish", sql="SELECT customer_id, SUM(total) AS spent FROM orders GROUP BY customer_id ORDER BY spent DESC LIMIT 1", summary="Customer #1 spent the most, with 500 in orders."),
        ],
    )

    token = register_and_token(client, "agent-reload@example.com", "Agent Reload")
    headers = {"Authorization": f"Bearer {token}"}
    connection_id = create_connection_with_schema(client, token)
    session = client.post("/chat/sessions", json={"connection_id": connection_id}, headers=headers)
    assert session.status_code == 200
    session_id = session.json()["id"]

    response = client.post(
        "/query/generate",
        json={"question": "Which customer spent the most?", "connection_id": connection_id, "session_id": session_id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert [step["tool"] for step in body["steps"]] == ["get_columns", "run_sql", "finish"]

    # Simulate the user leaving and coming back: reload the persisted messages.
    history = client.get(f"/chat/sessions/{session_id}", headers=headers)
    assert history.status_code == 200
    messages = history.json()
    assistant = [m for m in messages if m["role"] == "assistant"][-1]
    assert assistant["result"] is not None
    assert [step["tool"] for step in assistant["result"]["steps"]] == ["get_columns", "run_sql", "finish"]


def test_simple_questions_stay_on_fast_pipeline(client, monkeypatch):
    from app.api import query as query_api

    called = {"agent": False}

    def forbidden_agent(*args, **kwargs):
        called["agent"] = True
        raise AssertionError("agent should not run for simple questions")

    monkeypatch.setattr(query_api, "build_connector", lambda connection: RecordingConnector())
    token = register_and_token(client, "agent-simple@example.com", "Agent Simple")
    connection_id = create_connection_with_schema(client, token)

    # LLM_PROVIDER is "fallback" in tests, so the agent is unavailable anyway —
    # the question must still be answered by the classic pipeline.
    response = client.post(
        "/query/generate",
        json={"question": "show all rows from orders", "connection_id": connection_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["steps"] == []
    assert body["sql"].upper().startswith("SELECT")
    assert called["agent"] is False
