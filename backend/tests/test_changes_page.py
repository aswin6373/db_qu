"""Tests for the Changes audit page: table extraction and the
/organizations/changes endpoint."""

from sqlalchemy import select

from app.core.security import create_access_token
from app.models import DBConnection, Organization, QueryLog, User
from app.services.sql_validator import extract_table_names
from conftest import TestingSessionLocal


def test_extract_table_names_insert():
    assert extract_table_names("INSERT INTO products (name) VALUES ('x')") == ["products"]


def test_extract_table_names_update():
    sql = "UPDATE products SET price = 10 WHERE id = 1"
    assert extract_table_names(sql) == ["products"]


def test_extract_table_names_join():
    sql = "SELECT * FROM orders JOIN customers ON orders.customer_id = customers.id"
    assert set(extract_table_names(sql)) == {"orders", "customers"}


def test_extract_table_names_backticks_and_garbage():
    assert extract_table_names("SELECT * FROM `orders`") == ["orders"]
    assert extract_table_names("") == []
    # Never raises on non-SQL input - the audit log must not break on it.
    result = extract_table_names("totally not sql /// ???")
    assert isinstance(result, list) and len(result) <= 10


def test_changes_endpoint_shows_only_writes(client):
    db = TestingSessionLocal()
    org = Organization(name="Audit Org")
    db.add(org)
    db.flush()
    user = User(
        organization_id=org.id,
        email="auditor@example.com",
        hashed_password="x",
        role="admin",
    )
    db.add(user)
    connection = DBConnection(
        organization_id=org.id,
        name="Main DB",
        host="localhost",
        port=3306,
        username="u",
        encrypted_password="x",
        database_name="app",
    )
    db.add(connection)
    db.flush()
    db.add_all(
        [
            QueryLog(
                organization_id=org.id,
                user_id=user.id,
                connection_id=connection.id,
                natural_language="add product x",
                generated_sql="INSERT INTO products (name) VALUES ('x')",
                query_type="insert",
                status="executed",
                affected_tables='["products"]',
            ),
            QueryLog(
                organization_id=org.id,
                user_id=user.id,
                connection_id=connection.id,
                natural_language="how many products?",
                generated_sql="SELECT COUNT(*) FROM products",
                query_type="select",
                status="executed",
            ),
            QueryLog(
                organization_id=org.id,
                user_id=user.id,
                connection_id=connection.id,
                natural_language="remove old rows",
                generated_sql="DELETE FROM products WHERE created_at < '2020-01-01'",
                query_type="delete",
                status="pending_confirmation",
                affected_tables='["products"]',
            ),
        ]
    )
    db.commit()
    # Another workspace's write must never leak into this one's audit page.
    other_org = Organization(name="Other Org")
    db.add(other_org)
    db.flush()
    other_user = User(
        organization_id=other_org.id, email="other@example.com", hashed_password="x"
    )
    db.add(other_user)
    db.flush()
    db.add(
        QueryLog(
            organization_id=other_org.id,
            user_id=other_user.id,
            natural_language="foreign insert",
            generated_sql="INSERT INTO secret VALUES (1)",
            query_type="insert",
            status="executed",
        )
    )
    db.commit()
    user_id = user.id
    connection_id = connection.id
    db.close()

    token = create_access_token(str(user_id))
    response = client.get(
        "/organizations/changes", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    entries = response.json()
    # The SELECT is excluded, the foreign org never appears.
    assert len(entries) == 2
    assert entries[0]["question"] == "remove old rows"  # newest first
    assert entries[0]["status"] == "pending_confirmation"
    assert entries[0]["tables"] == ["products"]
    assert entries[0]["user_name"] == "auditor"
    assert entries[1]["query_type"] == "insert"
    assert entries[1]["connection_name"] == "Main DB"
    assert connection_id  # sanity: captured before session close


def test_confirm_records_who_and_when(client):
    db = TestingSessionLocal()
    org = Organization(name="Confirm Org")
    db.add(org)
    db.flush()
    user = User(
        organization_id=org.id, email="confirmer@example.com", hashed_password="x", role="admin"
    )
    db.add(user)
    db.flush()
    db.add(
        QueryLog(
            organization_id=org.id,
            user_id=user.id,
            natural_language="insert thing",
            generated_sql="INSERT INTO things (name) VALUES ('t')",
            query_type="insert",
            status="pending_confirmation",
        )
    )
    db.commit()
    log_id = db.scalar(select(QueryLog.id).order_by(QueryLog.id.desc()))
    user_id = user.id
    db.close()

    token = create_access_token(str(user_id))
    response = client.post(
        f"/query/{log_id}/confirm", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200

    changes = client.get(
        "/organizations/changes", headers={"Authorization": f"Bearer {token}"}
    ).json()
    entry = next(item for item in changes if item["id"] == log_id)
    assert entry["status"] == "executed"
    assert entry["confirmed_by"] == "confirmer"
    assert entry["confirmed_at"] is not None


def test_cancel_records_cancelled_and_shows_on_changes_page(client):
    db = TestingSessionLocal()
    org = Organization(name="Cancel Org")
    db.add(org)
    db.flush()
    user = User(
        organization_id=org.id, email="canceller@example.com", hashed_password="x", role="admin"
    )
    db.add(user)
    db.flush()
    db.add(
        QueryLog(
            organization_id=org.id,
            user_id=user.id,
            natural_language="insert item",
            generated_sql="INSERT INTO items (name) VALUES ('item1')",
            query_type="insert",
            status="pending_confirmation",
        )
    )
    db.commit()
    log_id = db.scalar(select(QueryLog.id).order_by(QueryLog.id.desc()))
    user_id = user.id
    db.close()

    token = create_access_token(str(user_id))
    response = client.post(
        f"/query/{log_id}/cancel", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["is_cancelled"] is True

    changes = client.get(
        "/organizations/changes", headers={"Authorization": f"Bearer {token}"}
    ).json()
    entry = next(item for item in changes if item["id"] == log_id)
    assert entry["status"] == "cancelled"
