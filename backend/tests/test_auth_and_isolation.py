from app.models import DBConnection
from app.services.crypto import encrypt_secret


def register(client, email, organization):
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "password123",
            "organization_name": organization,
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_registration_duplicate_login_and_protected_route(client):
    token = register(client, "aswin@example.com", "QueryMind")

    duplicate = client.post(
        "/auth/register",
        json={
            "email": "aswin@example.com",
            "password": "password123",
            "organization_name": "QueryMind",
        },
    )
    assert duplicate.status_code == 409

    login = client.post(
        "/auth/login",
        json={"email": "aswin@example.com", "password": "password123"},
    )
    assert login.status_code == 200

    wrong_password = client.post(
        "/auth/login",
        json={"email": "aswin@example.com", "password": "wrongpass"},
    )
    assert wrong_password.status_code == 401

    unauthorized = client.get("/auth/me")
    assert unauthorized.status_code == 401

    authorized = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert authorized.status_code == 200
    assert authorized.json()["email"] == "aswin@example.com"


def test_organization_a_cannot_retrieve_organization_b_connection(client):
    token_a = register(client, "a@example.com", "Org A")
    token_b = register(client, "b@example.com", "Org B")

    created = client.post(
        "/connections",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "A database",
            "host": "localhost",
            "port": 3306,
            "username": "root",
            "password": "secret",
            "database_name": "org_a",
            "test_live": False,
        },
    )
    assert created.status_code == 200
    connection_id = created.json()["id"]

    visible_to_a = client.get("/connections", headers={"Authorization": f"Bearer {token_a}"})
    visible_to_b = client.get("/connections", headers={"Authorization": f"Bearer {token_b}"})
    assert len(visible_to_a.json()) == 1
    assert visible_to_b.json() == []

    blocked = client.get(
        f"/connections/{connection_id}/schema",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert blocked.status_code == 404
