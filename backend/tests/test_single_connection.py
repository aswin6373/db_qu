def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_workspace_limited_to_single_connection(client):
    token = register_and_token(client, "limit-org@example.com", "Org Limit")

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
    assert second.status_code == 409
    assert "already has a database connection" in second.json()["detail"]

    # Deleting the first connection frees the slot again
    connection_id = first.json()["id"]
    deleted = client.delete(f"/connections/{connection_id}", headers={"Authorization": f"Bearer {token}"})
    assert deleted.status_code == 204

    third = client.post(
        "/connections",
        json={"name": "Third DB", "host": "db3", "port": 3306, "username": "u", "password": "p", "database_name": "d3", "test_live": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert third.status_code == 200
