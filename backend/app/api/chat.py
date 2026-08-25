import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import ChatSession, DBConnection, Message, User
from app.schemas.dto import (
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatSessionUpdate,
)

router = APIRouter(prefix="/chat", tags=["chat"])


def _org_session(session_id: int, user: User, db: Session) -> ChatSession:
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.organization_id == user.organization_id,
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return session


def _org_connection(connection_id: int | None, user: User, db: Session) -> DBConnection | None:
    if connection_id is None:
        return None
    connection = db.scalar(
        select(DBConnection).where(
            DBConnection.id == connection_id,
            DBConnection.organization_id == user.organization_id,
        )
    )
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection


def _message_count(db: Session, session_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Message).where(Message.session_id == session_id)) or 0


def _session_response(
    session: ChatSession,
    message_count: int,
    connection_name: str | None = None,
) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=session.id,
        title=session.title,
        connection_id=session.connection_id,
        connection_name=connection_name,
        created_at=session.created_at,
        updated_at=session.updated_at,
        message_count=message_count,
    )


@router.post("/sessions", response_model=ChatSessionResponse)
def create_session(payload: ChatSessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = _org_connection(payload.connection_id, user, db)
    title = payload.title.strip() or "New chat"
    session = ChatSession(
        organization_id=user.organization_id,
        user_id=user.id,
        connection_id=connection.id if connection else None,
        title=title[:255],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_response(session, 0, connection.name if connection else None)


@router.get("/sessions", response_model=list[ChatSessionResponse])
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(ChatSession, func.count(Message.id), DBConnection.name)
        .outerjoin(Message, Message.session_id == ChatSession.id)
        .outerjoin(DBConnection, DBConnection.id == ChatSession.connection_id)
        .where(ChatSession.organization_id == user.organization_id)
        .group_by(ChatSession.id, DBConnection.name)
        .order_by(
            func.coalesce(ChatSession.updated_at, ChatSession.created_at).desc(),
            ChatSession.id.desc(),
        )
    ).all()
    return [_session_response(session, count, name) for session, count, name in rows]


@router.get("/sessions/{session_id}", response_model=list[ChatMessageResponse])
def session_messages(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = _org_session(session_id, user, db)
    messages = db.scalars(
        select(Message).where(Message.session_id == session.id).order_by(Message.created_at, Message.id)
    ).all()
    return [
        ChatMessageResponse(
            id=message.id,
            role=message.role,
            content=message.content,
            sql=message.sql,
            query_id=message.query_id,
            result=json.loads(message.result_json) if message.result_json else None,
            created_at=message.created_at,
        )
        for message in messages
    ]


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
def rename_session(
    session_id: int,
    payload: ChatSessionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _org_session(session_id, user, db)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Chat title cannot be empty")
    session.title = title[:255]
    db.commit()
    db.refresh(session)
    connection_name = session.connection.name if session.connection else None
    return _session_response(session, _message_count(db, session.id), connection_name)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = _org_session(session_id, user, db)
    db.execute(delete(Message).where(Message.session_id == session.id))
    db.delete(session)
    db.commit()
    return Response(status_code=204)
