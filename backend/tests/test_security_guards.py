"""Security guards added in the hardening pass: response shaping, ownership
checks on write confirmation, login lockout, rate limiting, and token expiry."""

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt

from app.core.config import get_settings


def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_connection_with_schema(client, token: str) -> int:
    import json

    from conftest import TestingSessionLocal
    from app.models import DBConnection

    response = client.post(
        "/connections",
        json={"name": "Guard DB", "host": "db", "port": 3306, "username": "u", "password": "p", "database_name": "d", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    connection_id = response.json()["id"]
    db = TestingSessionLocal()
    try:
        connection = db.get(DBConnection, connection_id)
        connection.schema_cache = json.dumps(
            {"tables": {"customers": {"columns": [{"name": "id", "type": "int", "key": "PRI"}]}}}
        )
        db.commit()
    finally:
        db.close()
    return connection_id


def test_organizations_me_never_leaks_internal_columns(client):
    token = register_and_token(client, "me-guard@example.com", "Org Me Guard")
    headers = {"Authorization": f"Bearer {token}"}

    # Store a secret integration key first — it must not appear in /me.
    saved = client.put(
        "/organizations/integrations",
        json={"provider": "gemini", "api_key": "secret-key-abc-9876"},
        headers=headers,
    )
    assert saved.status_code == 200

    body = client.get("/organizations/me", headers=headers).json()
    assert body == {"id": body["id"], "name": "Org Me Guard"}
    assert "encrypted_ai_key" not in body
    assert "ai_provider" not in body
    assert "ai_model" not in body
    assert "ai_base_url" not in body
    assert "secret-key-abc-9876" not in str(body)


def test_write_confirm_is_limited_to_the_requesting_user(client, monkeypatch):
    from app.api import query as query_api

    class FakeConnector:
        def execute(self, sql):
            return [], []

        def close(self):
            pass

    monkeypatch.setattr(query_api, "build_connector", lambda connection: FakeConnector())

    admin_token = register_and_token(client, "confirm-owner@example.com", "Confirm Owner Org")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    connection_id = create_connection_with_schema(client, admin_token)

    member_added = client.post(
        "/organizations/members",
        json={"email": "confirm-mate@example.com", "password": "memberpass1"},
        headers=admin_headers,
    )
    assert member_added.status_code == 201
    member_login = client.post("/auth/login", json={"email": "confirm-mate@example.com", "password": "memberpass1"})
    member_headers = {"Authorization": f"Bearer {member_login.json()['access_token']}"}

    asked = client.post(
        "/query/generate",
        json={"question": "delete customer rows", "connection_id": connection_id},
        headers=admin_headers,
    )
    assert asked.status_code == 200
    assert asked.json()["requires_confirmation"] is True
    query_id = asked.json()["query_id"]

    foreign_confirm = client.post(f"/query/{query_id}/confirm", headers=member_headers)
    assert foreign_confirm.status_code == 404

    owner_confirm = client.post(f"/query/{query_id}/confirm", headers=admin_headers)
    assert owner_confirm.status_code == 200


def test_expired_jwt_is_rejected(client):
    settings = get_settings()
    expired = jose_jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=5)},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_login_locks_after_repeated_failures(client):
    register_and_token(client, "lockout@example.com", "Lockout Org")

    for _ in range(10):
        failed = client.post(
            "/auth/login",
            json={"email": "lockout@example.com", "password": "totally-wrong"},
        )
        assert failed.status_code == 401

    even_correct_password_is_blocked = client.post(
        "/auth/login",
        json={"email": "lockout@example.com", "password": "password123"},
    )
    assert even_correct_password_is_blocked.status_code == 429

    other_account_unaffected = client.post(
        "/auth/register",
        json={"email": "unlocked@example.com", "password": "password123", "organization_name": "Lockout Org 2"},
    )
    assert other_account_unaffected.status_code == 200


def test_rate_limit_middleware_returns_429_over_limit():
    from app.main import RateLimitMiddleware

    probe = FastAPI()

    @probe.get("/probe")
    def probe_endpoint():
        return {"ok": True}

    limited = RateLimitMiddleware(probe, limit_per_minute=3)
    client = TestClient(limited)

    codes = [client.get("/probe").status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_health_endpoints_are_exempt_from_rate_limiting():
    from app.main import RateLimitMiddleware

    probe = FastAPI()

    @probe.get("/health")
    def health():
        return {"status": "ok"}

    limited = RateLimitMiddleware(probe, limit_per_minute=1)
    client = TestClient(limited)

    assert client.get("/health").status_code == 200
    assert client.get("/health").status_code == 200
