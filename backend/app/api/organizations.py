import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models import ChatSession, DBConnection, Message, Organization, QueryLog, User
from app.schemas.dto import DashboardResponse, MemberCreate, MemberResponse

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


@router.get("/me")
def my_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.get(Organization, user.organization_id)


def _member_response(member: User) -> MemberResponse:
    return MemberResponse(id=member.id, email=member.email, role=member.role, created_at=member.created_at)


@router.get("/members", response_model=list[MemberResponse])
def list_members(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    members = db.scalars(
        select(User)
        .where(User.organization_id == user.organization_id)
        .order_by(User.created_at, User.id)
    ).all()
    return [_member_response(member) for member in members]


@router.post("/members", response_model=MemberResponse, status_code=201)
def add_member(payload: MemberCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = payload.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="That email is already registered")

    member = User(
        organization_id=user.organization_id,
        email=email,
        hashed_password=hash_password(payload.password),
        role="member",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_response(member)


@router.delete("/members/{member_id}", status_code=204)
def remove_member(member_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    member = db.scalar(
        select(User).where(
            User.id == member_id,
            User.organization_id == user.organization_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")
    if member.role == "admin":
        raise HTTPException(status_code=400, detail="Admins cannot be removed")

    # Keep the organization's query history, but drop the member's personal chats.
    db.execute(update(QueryLog).where(QueryLog.user_id == member.id).values(user_id=user.id))
    member_sessions = db.scalars(select(ChatSession).where(ChatSession.user_id == member.id)).all()
    for session in member_sessions:
        db.execute(delete(Message).where(Message.session_id == session.id))
        db.delete(session)
    db.delete(member)
    db.commit()
    return Response(status_code=204)


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    organization = db.get(Organization, user.organization_id)
    connection_count = db.scalar(
        select(func.count()).select_from(DBConnection).where(DBConnection.organization_id == user.organization_id)
    )
    query_count = db.scalar(
        select(func.count()).select_from(QueryLog).where(QueryLog.organization_id == user.organization_id)
    )
    logs = db.scalars(
        select(QueryLog)
        .where(QueryLog.organization_id == user.organization_id)
        .order_by(QueryLog.created_at.desc())
        .limit(5)
    ).all()
    return {
        "organization": organization,
        "connection_count": connection_count,
        "query_count": query_count,
        "recent_activity": [
            {
                "id": log.id,
                "question": log.natural_language,
                "sql": log.generated_sql,
                "status": log.status,
                "created_at": _iso_utc(log.created_at),
                "rows_returned": len((json.loads(log.result_preview or "{}") or {}).get("rows", [])),
                "preview": json.loads(log.result_preview or "{}"),
            }
            for log in logs
        ],
    }
