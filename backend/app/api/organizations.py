import json
import logging
from datetime import datetime, timezone

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, aliased

from app.api.dependencies import get_current_user, require_admin
from app.core.security import hash_password
from app.db.session import get_db
from app.models import ChatSession, DBConnection, Message, Organization, QueryLog, User
from app.schemas.dto import (
    ChangeLogEntry,
    DashboardResponse,
    IntegrationResponse,
    IntegrationUpdate,
    MemberCreate,
    MemberResponse,
    OrganizationResponse,
)
from app.services.ai import AIConfig
from app.services.crypto import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/organizations", tags=["organizations"])
logger = logging.getLogger("querymind")


def ai_config_for_org(organization: Organization | None) -> AIConfig | None:
    """Workspace's own AI key (bring your own key); None falls back to server settings."""
    if organization is None or not organization.ai_provider:
        return None
    api_key = None
    if organization.encrypted_ai_key:
        try:
            api_key = decrypt_secret(organization.encrypted_ai_key)
        except InvalidToken:
            # The stored key can no longer be decrypted (e.g. FERNET_KEY was
            # rotated). Degrade to the server-side provider instead of
            # silently pretending the workspace still has its own key.
            logger.warning(
                "workspace_ai_key_undecryptable organization=%s provider=%s",
                organization.id,
                organization.ai_provider,
            )
            return None
    return AIConfig(
        provider=organization.ai_provider,
        api_key=api_key,
        model=organization.ai_model,
        base_url=organization.ai_base_url,
    )


def _iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


@router.get("/me", response_model=OrganizationResponse)
def my_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> OrganizationResponse:
    # Response model is mandatory here: returning the raw ORM row would leak
    # internal columns such as encrypted_ai_key to every member.
    organization = db.get(Organization, user.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse(id=organization.id, name=organization.name)


def _integration_response(organization: Organization) -> IntegrationResponse:
    key_hint = None
    if organization.encrypted_ai_key:
        try:
            key_hint = f"••••{decrypt_secret(organization.encrypted_ai_key)[-4:]}"
        except InvalidToken:
            key_hint = "••••"
    return IntegrationResponse(
        provider=organization.ai_provider,
        has_key=bool(organization.encrypted_ai_key),
        key_hint=key_hint,
        model=organization.ai_model,
        base_url=organization.ai_base_url,
    )


@router.get("/integrations", response_model=IntegrationResponse)
def get_integration(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    organization = db.get(Organization, user.organization_id)
    return _integration_response(organization)


@router.put("/integrations", response_model=IntegrationResponse)
def update_integration(payload: IntegrationUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    organization = db.get(Organization, user.organization_id)
    needs_key = payload.provider in {"gemini", "openai"}
    if needs_key and not payload.api_key and not organization.encrypted_ai_key:
        raise HTTPException(status_code=400, detail="An API key is required for this provider")
    if payload.api_key:
        organization.encrypted_ai_key = encrypt_secret(payload.api_key.strip())
    organization.ai_provider = payload.provider
    organization.ai_model = (payload.model or "").strip() or None
    # A base URL only makes sense for self-hosted providers; switching away
    # from Ollama must not leave a stale server address behind.
    organization.ai_base_url = (
        (payload.base_url or "").strip() or None
        if payload.provider == "ollama"
        else None
    )
    if payload.provider == "ollama" and not organization.ai_base_url:
        raise HTTPException(status_code=400, detail="Ollama needs a base URL (e.g. http://your-server:11434)")
    db.commit()
    db.refresh(organization)
    return _integration_response(organization)


@router.delete("/integrations", response_model=IntegrationResponse)
def disconnect_integration(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    organization = db.get(Organization, user.organization_id)
    organization.ai_provider = None
    organization.encrypted_ai_key = None
    organization.ai_model = None
    organization.ai_base_url = None
    db.commit()
    db.refresh(organization)
    return _integration_response(organization)


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
    # Their logs keep user_id=None — history is never silently re-attributed
    # to another person, which would corrupt the audit trail.
    db.execute(update(QueryLog).where(QueryLog.user_id == member.id).values(user_id=None))
    member_sessions = db.scalars(select(ChatSession).where(ChatSession.user_id == member.id)).all()
    for session in member_sessions:
        db.execute(delete(Message).where(Message.session_id == session.id))
        db.delete(session)
    db.delete(member)
    db.commit()
    return Response(status_code=204)


@router.get("/changes", response_model=list[ChangeLogEntry])
def change_log(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Workspace audit trail: every INSERT/UPDATE/DELETE attempt — who asked,
    when, what, and which tables. Read-only for all members; entries are never
    deletable from the UI."""
    confirmer = aliased(User)
    rows = db.execute(
        select(QueryLog, User, confirmer, DBConnection.name)
        .join(User, User.id == QueryLog.user_id, isouter=True)
        .join(confirmer, confirmer.id == QueryLog.confirmed_by, isouter=True)
        .join(DBConnection, DBConnection.id == QueryLog.connection_id, isouter=True)
        .where(
            QueryLog.organization_id == user.organization_id,
            func.lower(QueryLog.query_type) != "select",
        )
        .order_by(QueryLog.created_at.desc(), QueryLog.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    def _display_name(account: User | None) -> str | None:
        if account is None:
            return None
        return account.email.split("@", 1)[0]

    entries: list[ChangeLogEntry] = []
    for log, author, confirmed_by_account, connection_name in rows:
        try:
            tables = json.loads(log.affected_tables or "[]")
        except (json.JSONDecodeError, TypeError):
            tables = []
        entries.append(
            ChangeLogEntry(
                id=log.id,
                user_name=_display_name(author) or "Unknown",
                user_email=author.email if author else None,
                question=log.natural_language,
                sql=log.generated_sql,
                query_type=log.query_type,
                status=log.status,
                tables=tables if isinstance(tables, list) else [],
                connection_name=connection_name,
                confirmed_at=_iso_utc(log.confirmed_at),
                confirmed_by=_display_name(confirmed_by_account),
                created_at=_iso_utc(log.created_at),
            )
        )
    return entries


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

    def _preview(log: QueryLog) -> dict:
        try:
            parsed = json.loads(log.result_preview or "{}")
        except (json.JSONDecodeError, TypeError):
            parsed = {}
        return parsed if isinstance(parsed, dict) else {}

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
                "rows_returned": len(_preview(log).get("rows", [])),
                "preview": _preview(log),
            }
            for log in logs
        ],
    }
