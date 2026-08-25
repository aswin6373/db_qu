def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def add_member(client, admin_token: str, email: str, password: str = "memberpass1") -> dict:
    response = client.post(
        "/organizations/members",
        json={"email": email, "password": password},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    return response.json()


def test_admin_can_connect_own_ai_key(client):
    admin_token = register_and_token(client, "byok-admin@example.com", "Org BYOK")

    default_state = client.get("/organizations/integrations", headers={"Authorization": f"Bearer {admin_token}"})
    assert default_state.status_code == 200
    assert default_state.json()["provider"] is None
    assert default_state.json()["has_key"] is False

    connected = client.put(
        "/organizations/integrations",
        json={"provider": "gemini", "api_key": "secret-gemini-key-1234"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert connected.status_code == 200
    body = connected.json()
    assert body["provider"] == "gemini"
    assert body["has_key"] is True
    # The full key must never be returned — only a masked hint.
    assert "secret-gemini-key" not in body["key_hint"]
    assert body["key_hint"].endswith("1234")

    updated = client.get("/organizations/integrations", headers={"Authorization": f"Bearer {admin_token}"})
    assert updated.json()["provider"] == "gemini"
    assert updated.json()["has_key"] is True


def test_disconnect_reverts_to_platform_default(client):
    admin_token = register_and_token(client, "byok-disconnect@example.com", "Org Disconnect")

    client.put(
        "/organizations/integrations",
        json={"provider": "openai", "api_key": "sk-test-abcdef"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    disconnected = client.delete("/organizations/integrations", headers={"Authorization": f"Bearer {admin_token}"})
    assert disconnected.status_code == 200
    body = disconnected.json()
    assert body["provider"] is None
    assert body["has_key"] is False


def test_integrations_require_admin_and_valid_payload(client):
    admin_token = register_and_token(client, "byok-guard@example.com", "Org Guard")
    add_member(client, admin_token, "byok-mate@example.com")

    member_login = client.post("/auth/login", json={"email": "byok-mate@example.com", "password": "memberpass1"})
    member_token = member_login.json()["access_token"]

    forbidden = client.get("/organizations/integrations", headers={"Authorization": f"Bearer {member_token}"})
    assert forbidden.status_code == 403

    forbidden_save = client.put(
        "/organizations/integrations",
        json={"provider": "gemini", "api_key": "k"},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert forbidden_save.status_code == 403

    missing_key = client.put(
        "/organizations/integrations",
        json={"provider": "gemini"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert missing_key.status_code == 400

    ollama_needs_url = client.put(
        "/organizations/integrations",
        json={"provider": "ollama"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert ollama_needs_url.status_code == 400


def test_workspaces_are_isolated(client):
    token_a = register_and_token(client, "byok-a@example.com", "Org A")
    token_b = register_and_token(client, "byok-b@example.com", "Org B")

    client.put(
        "/organizations/integrations",
        json={"provider": "gemini", "api_key": "key-of-org-a"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    state_b = client.get("/organizations/integrations", headers={"Authorization": f"Bearer {token_b}"})
    assert state_b.json()["provider"] is None
    assert state_b.json()["has_key"] is False
