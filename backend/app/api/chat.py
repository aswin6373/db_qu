from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import ChatSession, Message, User

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/sessions")
def sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(ChatSession).where(ChatSession.organization_id == user.organization_id).order_by(ChatSession.created_at.desc())
    ).all()


@router.get("/sessions/{session_id}")
def session_messages(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.scalar(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.organization_id == user.organization_id)
    )
    if session is None:
        return []
    return db.scalars(select(Message).where(Message.session_id == session.id).order_by(Message.created_at)).all()
