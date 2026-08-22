import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.connectors.mysql import MySQLConnector
from app.db.session import get_db
from app.models import DBConnection, User
from app.schemas.dto import ConnectionCreate, ConnectionResponse
from app.services.crypto import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("", response_model=ConnectionResponse)
def create_connection(payload: ConnectionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connector = MySQLConnector(payload.host, payload.port, payload.username, payload.password, payload.database_name)
    schema = {"tables": {}}
    if payload.test_live:
        try:
            connector.connect()
            schema = connector.get_schema()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not connect to MySQL: {exc}") from exc
    connection = DBConnection(
        organization_id=user.organization_id,
        name=payload.name,
        host=payload.host,
        port=payload.port,
        username=payload.username,
        encrypted_password=encrypt_secret(payload.password),
        database_name=payload.database_name,
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


def build_connector(connection: DBConnection) -> MySQLConnector:
    return MySQLConnector(
        connection.host,
        connection.port,
        connection.username,
        decrypt_secret(connection.encrypted_password),
        connection.database_name,
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
