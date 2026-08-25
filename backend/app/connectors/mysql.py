import io
import re
import select
import socket
import threading
from contextlib import contextmanager
from typing import Any, Iterator

import mysql.connector
import paramiko

from app.connectors.base import DBConnector
from app.core.config import get_settings


def _load_private_key(secret: str) -> paramiko.PKey:
    """Parse a PEM private key, trying the concrete key classes (PKey.from_private_key
    on the base class is broken in some paramiko releases)."""
    errors = []
    for key_cls in (paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.RSAKey):
        try:
            return key_cls.from_private_key(io.StringIO(secret))
        except paramiko.SSHException as exc:
            errors.append(f"{key_cls.__name__}: {exc}")
    raise paramiko.SSHException("Could not parse SSH private key. " + "; ".join(errors))


class SSHTunnel:
    """Local port forward over an authenticated paramiko transport.

    Binds an ephemeral 127.0.0.1 port and bridges every accepted connection to
    (remote_host, remote_port) through a direct-tcpip channel on the SSH server.
    """

    def __init__(self, ssh_host: str, ssh_port: int, ssh_username: str | None, ssh_secret: str | None, remote_host: str, remote_port: int):
        self.ssh_host = ssh_host
        self.ssh_port = ssh_port
        self.ssh_username = ssh_username or "root"
        self.ssh_secret = ssh_secret or ""
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.transport: paramiko.Transport | None = None
        self.server_socket: socket.socket | None = None
        self.local_port: int = 0
        self._accept_thread: threading.Thread | None = None
        self._stopped = threading.Event()

    def open(self) -> int:
        """Authenticate to the SSH server, start the local listener, return the local port."""
        if self.server_socket is not None:
            return self.local_port
        try:
            self.transport = paramiko.Transport((self.ssh_host, self.ssh_port))
            if self.ssh_secret.startswith("-----"):
                pkey = _load_private_key(self.ssh_secret)
                self.transport.connect(username=self.ssh_username, pkey=pkey)
            else:
                self.transport.connect(username=self.ssh_username, password=self.ssh_secret)
            self._bind_local()
            return self.local_port
        except Exception:
            self.close()
            raise

    def _bind_local(self) -> None:
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(("127.0.0.1", 0))
        self.server_socket.listen(8)
        self.local_port = int(self.server_socket.getsockname()[1])
        self._stopped.clear()
        self._accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._accept_thread.start()

    def close(self) -> None:
        self._stopped.set()
        if self.server_socket is not None:
            try:
                self.server_socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self.server_socket.close()
            except OSError:
                pass
            self.server_socket = None
        if self.transport is not None:
            try:
                self.transport.close()
            except Exception:
                pass
            self.transport = None

    def _accept_loop(self) -> None:
        while not self._stopped.is_set():
            try:
                client, _addr = self.server_socket.accept()  # type: ignore[union-attr]
            except OSError:
                break
            client.settimeout(30)
            threading.Thread(target=self._bridge, args=(client,), daemon=True).start()
            if self._stopped.is_set():
                break

    def _bridge(self, client: socket.socket) -> None:
        channel = None
        try:
            transport = self.transport
            if transport is None or not transport.is_active():
                raise OSError("SSH transport closed")
            channel = transport.open_channel(
                "direct-tcpip",
                (self.remote_host, self.remote_port),
                client.getpeername(),
            )
            if channel is None:
                raise OSError("SSH server refused direct-tcpip channel")
            while True:
                readable, _, _ = select.select([client, channel], [], [], 1.0)
                if not readable:
                    if self._stopped.is_set():
                        break
                    continue
                if client in readable:
                    data = client.recv(16384)
                    if not data:
                        break
                    channel.sendall(data)
                if channel in readable:
                    data = channel.recv(16384)
                    if not data:
                        break
                    client.sendall(data)
        except Exception:
            pass
        finally:
            for sock in (channel, client):
                if sock is not None:
                    try:
                        sock.close()
                    except Exception:
                        pass


class MySQLConnector(DBConnector):
    VALID_SSL_MODES = {"PREFERRED", "REQUIRED", "DISABLED"}

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        database_name: str,
        ssl_mode: str = "PREFERRED",
        ssh_host: str | None = None,
        ssh_port: int = 22,
        ssh_username: str | None = None,
        ssh_password: str | None = None,
    ) -> None:
        if ssl_mode not in self.VALID_SSL_MODES:
            raise ValueError(f"Unsupported SSL mode: {ssl_mode}")
        self.config: dict[str, Any] = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "database": database_name,
            "connection_timeout": get_settings().mysql_connect_timeout,
        }
        self.statement_timeout_ms = get_settings().mysql_statement_timeout_ms
        if ssl_mode == "DISABLED":
            self.config["ssl_disabled"] = True
        elif ssl_mode == "REQUIRED":
            self.config["ssl_mode"] = "REQUIRED"
        self.database_name = database_name
        self.tunnel: SSHTunnel | None = None
        if ssh_host:
            # The database host/port are dialed from the SSH server's point of view.
            self.tunnel = SSHTunnel(
                ssh_host=ssh_host,
                ssh_port=ssh_port,
                ssh_username=ssh_username,
                ssh_secret=ssh_password,
                remote_host=host,
                remote_port=port,
            )

    @contextmanager
    def tunneled_config(self) -> Iterator[dict[str, Any]]:
        """Yield the connection config, routing through the SSH tunnel when configured."""
        if self.tunnel is None:
            yield self.config
            return
        local_port = self.tunnel.open()
        forwarded = dict(self.config)
        forwarded["host"] = "127.0.0.1"
        forwarded["port"] = local_port
        try:
            yield forwarded
        finally:
            self.tunnel.close()

    def connect(self) -> None:
        with self.tunneled_config() as config:
            connection = mysql.connector.connect(**config)
            connection.close()

    def get_schema(self) -> dict[str, Any]:
        with self.tunneled_config() as config:
            connection = mysql.connector.connect(**config)
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = %s
                ORDER BY TABLE_NAME, ORDINAL_POSITION
                """,
                (self.database_name,),
            )
            schema: dict[str, Any] = {"tables": {}}
            for row in cursor.fetchall():
                table = row["TABLE_NAME"]
                schema["tables"].setdefault(table, {"columns": []})
                schema["tables"][table]["columns"].append(
                    {
                        "name": row["COLUMN_NAME"],
                        "type": row["DATA_TYPE"],
                        "key": row["COLUMN_KEY"] or "",
                        "nullable": row["IS_NULLABLE"] == "YES",
                        "default": row["COLUMN_DEFAULT"],
                        "extra": row["EXTRA"] or "",
                    }
                )
            cursor.close()
            connection.close()
            return schema

    def _with_execution_cap(self, sql: str) -> str:
        """Server-side runtime cap for SELECTs. A runaway query (or a SLEEP-style
        probe that slipped past validation) is killed by MySQL itself instead of
        hanging the worker. MAX_EXECUTION_TIME applies to SELECT only."""
        if self.statement_timeout_ms <= 0:
            return sql
        return re.sub(
            r"^(\s*)SELECT\b",
            rf"\1SELECT /*+ MAX_EXECUTION_TIME({self.statement_timeout_ms}) */",
            sql,
            count=1,
            flags=re.IGNORECASE,
        )

    def execute(self, sql: str) -> tuple[list[str], list[dict[str, Any]]]:
        with self.tunneled_config() as config:
            connection = mysql.connector.connect(**config)
            cursor = connection.cursor(dictionary=True)
            cursor.execute(self._with_execution_cap(sql))
            columns = list(cursor.column_names or [])
            rows = list(cursor.fetchall() or []) if cursor.with_rows else []
            connection.commit()
            cursor.close()
            connection.close()
            return columns, rows
