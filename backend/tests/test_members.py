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


def test_admin_can_add_member_who_can_login(client):
    admin_token = register_and_token(client, "admin-org@example.com", "Org Members")
    add_member(client, admin_token, "mate@example.com", "shared-secret-1")

    login = client.post("/auth/login", json={"email": "mate@example.com", "password": "shared-secret-1"})
    assert login.status_code == 200
    member_token = login.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {member_token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "member"


def test_members_listing_is_admin_only(client):
    admin_token = register_and_token(client, "admin-list@example.com", "Org List")
    add_member(client, admin_token, "mate-list@example.com")

    member_login = client.post("/auth/login", json={"email": "mate-list@example.com", "password": "memberpass1"})
    member_token = member_login.json()["access_token"]

    forbidden = client.get("/organizations/members", headers={"Authorization": f"Bearer {member_token}"})
    assert forbidden.status_code == 403

    allowed = client.get("/organizations/members", headers={"Authorization": f"Bearer {admin_token}"})
    assert allowed.status_code == 200
    emails = {member["email"] for member in allowed.json()}
    assert emails == {"admin-list@example.com", "mate-list@example.com"}


def test_only_admin_can_manage_connections(client):
    admin_token = register_and_token(client, "admin-conn@example.com", "Org Conn")
    add_member(client, admin_token, "mate-conn@example.com")

    member_login = client.post("/auth/login", json={"email": "mate-conn@example.com", "password": "memberpass1"})
    member_token = member_login.json()["access_token"]

    created = client.post(
        "/connections",
        json={"name": "Member DB", "host": "db1", "port": 3306, "username": "u", "password": "p", "database_name": "d1", "test_live": False},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert created.status_code == 403

    admin_connection = client.post(
        "/connections",
        json={"name": "Admin DB", "host": "db1", "port": 3306, "username": "u", "password": "p", "database_name": "d1", "test_live": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_connection.status_code == 200

    # Members can still see and use the workspace databases.
    listed = client.get("/connections", headers={"Authorization": f"Bearer {member_token}"})
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    removed = client.delete(
        f"/connections/{admin_connection.json()['id']}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert removed.status_code == 403


def test_admin_cannot_remove_self_or_other_admins(client):
    admin_token = register_and_token(client, "admin-self@example.com", "Org Self")

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    admin_id = me.json()["id"]

    self_removal = client.delete(f"/organizations/members/{admin_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert self_removal.status_code == 400

    member = add_member(client, admin_token, "mate-self@example.com")
    removed = client.delete(f"/organizations/members/{member['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert removed.status_code == 204

    gone = client.post("/auth/login", json={"email": "mate-self@example.com", "password": "memberpass1"})
    assert gone.status_code == 401
