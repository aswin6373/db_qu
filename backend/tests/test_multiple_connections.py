def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_workspace_allows_multiple_connections(client):
    token = register_and_token(client, "multi-org@example.com", "Org Multi")

    first = client.post(
        "/connections",
        json={"name": "First DB", "host": "db1", "port": 3306, "username": "u", "password": "p", "database_name": "d1", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200

    second = client.post(
        "/connections",
        json={"name": "Second DB", "host": "db2", "port": 3306, "username": "u", "password": "p", "database_name": "d2", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert second.status_code == 200

    third = client.post(
        "/connections",
        json={"name": "Third DB", "host": "db3", "port": 3306, "username": "u", "password": "p", "database_name": "d3", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert third.status_code == 200

    listed = client.get("/connections", headers={"Authorization": f"Bearer {token}"})
    assert listed.status_code == 200
    names = {connection["name"] for connection in listed.json()}
    assert names == {"First DB", "Second DB", "Third DB"}


def test_delete_connection_keeps_others(client):
    token = register_and_token(client, "delete-org@example.com", "Org Delete")

    first = client.post(
        "/connections",
        json={"name": "First DB", "host": "db1", "port": 3306, "username": "u", "password": "p", "database_name": "d1", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    second = client.post(
        "/connections",
        json={"name": "Second DB", "host": "db2", "port": 3306, "username": "u", "password": "p", "database_name": "d2", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 200
    assert second.status_code == 200

    deleted = client.delete(f"/connections/{first.json()['id']}", headers={"Authorization": f"Bearer {token}"})
    assert deleted.status_code == 204

    listed = client.get("/connections", headers={"Authorization": f"Bearer {token}"})
    names = {connection["name"] for connection in listed.json()}
    assert names == {"Second DB"}
