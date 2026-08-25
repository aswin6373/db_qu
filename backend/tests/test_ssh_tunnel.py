from unittest.mock import patch

from app.api.connections import build_connector
from app.connectors.mysql import MySQLConnector


def register_and_token(client, email: str, organization_name: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "organization_name": organization_name},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_connection(client, token: str, **overrides) -> dict:
    payload = {
        "name": "Tunnelled DB",
        "host": "127.0.0.1",
        "port": 3306,
        "username": "u",
        "password": "p",
        "database_name": "d1",
        "test_live": False,
    }
    payload.update(overrides)
    response = client.post("/connections", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    return response.json()


def test_connector_with_ssh_does_not_touch_network_on_init():
    connector = MySQLConnector(
        "127.0.0.1", 3306, "u", "p", "db", ssh_host="bastion", ssh_port=2222, ssh_username="ec2-user", ssh_password="secret"
    )
    assert connector.tunnel is not None
    assert connector.tunnel.transport is None
    assert connector.config["host"] == "127.0.0.1"
    assert connector.config["port"] == 3306


def test_tunnel_forwards_config_to_local_endpoint():
    connector = MySQLConnector(
        "db.internal", 3307, "u", "p", "db", ssh_host="bastion", ssh_username="root", ssh_password="secret"
    )
    with patch.object(type(connector.tunnel), "open", return_value=45671) as mock_open:
        with connector.tunneled_config() as config:
            assert config["host"] == "127.0.0.1"
            assert config["port"] == 45671
            assert config["database"] == "db"
            mock_open.assert_called_once()
    # Tunnel is torn down after the block and direct config is unchanged.
    assert connector.tunnel.server_socket is None
    assert connector.tunnel.transport is None
    assert connector.config["host"] == "db.internal"
    assert connector.config["port"] == 3307


def test_direct_connection_bypasses_tunnel_context():
    connector = MySQLConnector("h", 3306, "u", "p", "db")
    with connector.tunneled_config() as config:
        assert config is connector.config


def test_ssh_connection_round_trip_persists_and_restores(client):
    token = register_and_token(client, "ssh-org@example.com", "SSH Org")
    saved = create_connection(
        client,
        token,
        host="127.0.0.1",
        port=33060,
        ssh_host="bastion.example.com",
        ssh_port=2222,
        ssh_username="ec2-user",
        ssh_password="tunnel-secret",
    )
    assert saved["ssh_host"] == "bastion.example.com"
    assert saved["ssh_port"] == 2222
    assert saved["ssh_username"] == "ec2-user"

    connection = build_connector_from_api(client, token, saved["id"])
    assert connection.tunnel is not None
    assert connection.tunnel.ssh_host == "bastion.example.com"
    assert connection.tunnel.ssh_port == 2222
    assert connection.tunnel.ssh_username == "ec2-user"
    assert connection.tunnel.ssh_secret == "tunnel-secret"
    assert connection.tunnel.remote_host == "127.0.0.1"
    assert connection.tunnel.remote_port == 33060


def test_plain_connection_has_no_tunnel(client):
    token = register_and_token(client, "plain-org@example.com", "Plain Org")
    saved = create_connection(client, token, name="Direct DB")
    assert saved["ssh_host"] is None
    connection = build_connector_from_api(client, token, saved["id"])
    assert connection.tunnel is None


def build_connector_from_api(client, token: str, connection_id: int) -> MySQLConnector:
    from app.api.connections import build_connector
    from app.db.session import get_db
    from app.main import app
    from app.models import DBConnection

    override = app.dependency_overrides[get_db]
    db = next(override())
    try:
        record = db.get(DBConnection, connection_id)
        return build_connector(record)
    finally:
        db.close()
