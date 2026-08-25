import io
import select
import socket
import threading
from contextlib import contextmanager
from typing import Any, Iterator

import paramiko


def load_private_key(secret: str) -> paramiko.PKey:
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
    Protocol-agnostic: any TCP database protocol can be tunnelled through it.
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
                pkey = load_private_key(self.ssh_secret)
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
        if self._stopped is not None:
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


class TunnelledConnectorMixin:
    """Shared SSH-tunnel plumbing for network connectors.

    Mixins set `self.tunnel` in their own __init__; tunneled_config() then yields
    the connection config rewritten to the local tunnel endpoint. The tunnel is
    opened once per connector instance and stays up until close() so a
    multi-statement request does not re-handshake for every statement."""

    tunnel: SSHTunnel | None

    @contextmanager
    def tunneled_config(self) -> Iterator[dict[str, Any]]:
        if self.tunnel is None:
            yield self.config  # type: ignore[attr-defined]
            return
        local_port = self.tunnel.open()
        forwarded = dict(self.config)  # type: ignore[attr-defined]
        forwarded["host"] = "127.0.0.1"
        forwarded["port"] = local_port
        yield forwarded

    def close_tunnel(self) -> None:
        """Tear down the shared SSH tunnel (if any). Safe to call twice."""
        if self.tunnel is not None:
            self.tunnel.close()
            self.tunnel = None
