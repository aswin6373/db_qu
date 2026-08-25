import json
import logging

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.connectors.mysql import MySQLConnector
from app.db.session import get_db
from app.models import DBConnection, QueryLog, User
from app.schemas.dto import ConnectionCreate, ConnectionResponse, SchemaInsightsResponse
from app.services.crypto import decrypt_secret, encrypt_secret
from app.services.schema_insights import build_schema_insights

router = APIRouter(prefix="/connections", tags=["connections"])
logger = logging.getLogger("querymind")


@router.post("", response_model=ConnectionResponse)
def create_connection(payload: ConnectionCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    connector = MySQLConnector(
        payload.host,
        payload.port,
        payload.username,
        payload.password,
        payload.database_name,
        ssl_mode=payload.ssl_mode,
        ssh_host=payload.ssh_host,
        ssh_port=payload.ssh_port,
        ssh_username=payload.ssh_username,
        ssh_password=payload.ssh_password,
    )
    schema = {"tables": {}}
    if payload.test_live:
        try:
            connector.connect()
            schema = connector.get_schema()
        except Exception as exc:
            logger.warning(
                "connection_test_failed host=%s port=%s error=%s",
                payload.host,
                payload.port,
                exc,
                exc_info=True,
            )
            raise HTTPException(
                status_code=400,
                detail="Could not reach MySQL with these credentials and settings. Check the host, port, SSL mode, tunnel details, and password.",
            ) from exc
    connection = DBConnection(
        organization_id=user.organization_id,
        name=payload.name,
        host=payload.host,
        port=payload.port,
        username=payload.username,
        encrypted_password=encrypt_secret(payload.password),
        database_name=payload.database_name,
        ssl_mode=payload.ssl_mode,
        ssh_host=payload.ssh_host or None,
        ssh_port=payload.ssh_port if payload.ssh_host else 22,
        ssh_username=payload.ssh_username if payload.ssh_host else None,
        encrypted_ssh_password=encrypt_secret(payload.ssh_password) if payload.ssh_host and payload.ssh_password else None,
        schema_cache=json.dumps(schema),
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


@router.get("", response_model=list[ConnectionResponse])
def list_connections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(DBConnection).where(DBConnection.organization_id == user.organization_id).order_by(DBConnection.created_at.desc())
    ).all()


@router.get("/{connection_id}/schema")
def get_schema(connection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = _get_org_connection(connection_id, user, db)
    return json.loads(connection.schema_cache or "{}")


@router.get("/{connection_id}/insights", response_model=SchemaInsightsResponse)
def get_insights(connection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = _get_org_connection(connection_id, user, db)
    return build_schema_insights(json.loads(connection.schema_cache or "{}"))


@router.post("/{connection_id}/refresh", response_model=ConnectionResponse)
def refresh_connection(connection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = _get_org_connection(connection_id, user, db)
    connector = build_connector(connection)
    try:
        connector.connect()
        connection.schema_cache = json.dumps(connector.get_schema())
    except Exception as exc:
        logger.warning(
            "schema_refresh_failed connection=%s error=%s", connection.id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=400,
            detail="Could not refresh the schema — the database is unreachable with the saved credentials.",
        ) from exc
    db.commit()
    db.refresh(connection)
    return connection


@router.delete("/{connection_id}", status_code=204)
def delete_connection(connection_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    connection = _get_org_connection(connection_id, user, db)
    logs = db.scalars(
        select(QueryLog).where(
            QueryLog.organization_id == user.organization_id,
            QueryLog.connection_id == connection.id,
        )
    ).all()
    for log in logs:
        log.connection_id = None
    db.delete(connection)
    db.commit()
    return Response(status_code=204)


def build_connector(
    connection: DBConnection,
    ssh_host: str | None = None,
    ssh_port: int = 22,
    ssh_username: str | None = None,
    ssh_password: str | None = None,
) -> MySQLConnector:
    try:
        password = decrypt_secret(connection.encrypted_password)
    except InvalidToken as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "This database connection was saved with an old temporary encryption key. "
                "Please re-save the connection credentials once so QueryMind can use the new permanent key."
            ),
        ) from exc

    # Stored tunnel settings win unless explicitly overridden.
    if ssh_host is None and connection.ssh_host:
        ssh_host = connection.ssh_host
        ssh_port = connection.ssh_port or 22
        ssh_username = connection.ssh_username
        if connection.encrypted_ssh_password:
            try:
                ssh_password = decrypt_secret(connection.encrypted_ssh_password)
            except InvalidToken as exc:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "The SSH tunnel credentials for this connection were saved with an old encryption key. "
                        "Please re-save the connection so QueryMind can reach your database."
                    ),
                ) from exc

    return MySQLConnector(
        connection.host,
        connection.port,
        connection.username,
        password,
        connection.database_name,
        ssl_mode=connection.ssl_mode or "PREFERRED",
        ssh_host=ssh_host,
        ssh_port=ssh_port,
        ssh_username=ssh_username,
        ssh_password=ssh_password,
    )


def _get_org_connection(connection_id: int, user: User, db: Session) -> DBConnection:
    connection = db.scalar(
        select(DBConnection).where(
            DBConnection.id == connection_id,
            DBConnection.organization_id == user.organization_id,
        )
    )
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection
