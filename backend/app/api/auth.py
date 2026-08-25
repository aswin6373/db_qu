import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Organization, User
from app.schemas.dto import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Brute-force guard: after too many failed attempts for one email within the
# window, logins for that account are refused even with the correct password.
_FAILED_LOGIN_WINDOW_SECONDS = 900.0
_MAX_FAILED_LOGINS = 10
_MAX_TRACKED_EMAILS = 10_000
_failed_logins: dict[str, deque[float]] = defaultdict(deque)


def _prune_failures(attempts: deque[float], now: float) -> None:
    while attempts and now - attempts[0] > _FAILED_LOGIN_WINDOW_SECONDS:
        attempts.popleft()


def _login_locked(email: str, now: float) -> bool:
    attempts = _failed_logins.get(email)
    if not attempts:
        return False
    _prune_failures(attempts, now)
    return len(attempts) >= _MAX_FAILED_LOGINS


def _record_failed_login(email: str, now: float) -> None:
    if len(_failed_logins) > _MAX_TRACKED_EMAILS:
        stale = [key for key, value in _failed_logins.items() if not value]
        for key in stale[: len(_failed_logins) - _MAX_TRACKED_EMAILS]:
            del _failed_logins[key]
    attempts = _failed_logins[email]
    _prune_failures(attempts, now)
    attempts.append(now)


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    organization = Organization(name=payload.organization_name)
    db.add(organization)
    db.flush()
    user = User(
        organization_id=organization.id,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role="admin",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent signups with the same email: the SELECT above can
        # race — the unique constraint is the real referee.
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from None
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    now = time.monotonic()
    if _login_locked(email, now):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-ins for this account. Try again in 15 minutes.",
        )
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.hashed_password):
        _record_failed_login(email, now)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    _failed_logins.pop(email, None)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user
