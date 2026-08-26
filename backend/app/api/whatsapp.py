"""WhatsApp Cloud API bot with per-user account pairing.

Users chat with the workspace's WhatsApp number. On first contact they receive
a one-time magic link; signing in on that web page binds their phone number to
their platform account, and from then on every question runs through the same
SQL pipeline as the web app (intent -> agent/one-shot -> validate -> execute
-> summarize) as THAT user - answers go back as a text message with a
monospace table, optionally followed by a chart image.

Security model:
- The webhook is public, so authenticity comes from the `X-Hub-Signature-256`
  HMAC header (app secret) plus Meta's one-time verify-token handshake.
- Credentials NEVER travel through WhatsApp: pairing happens via an expiring
  signed link and the platform's normal login page.
- One WhatsApp number maps to exactly one account (last login wins).
- Write queries are never executed from WhatsApp - the sender is told to
  confirm them in the web app instead.
"""

import base64
import hashlib
import hmac
import json
import logging
import re
import threading
import time
from collections import OrderedDict
from urllib.parse import parse_qs, quote

import httpx
from fastapi import APIRouter, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.responses import HTMLResponse, JSONResponse, Response

from app.api.connections import build_connector
from app.api.organizations import ai_config_for_org
from app.api.query import (
    _is_followup_answer,
    _recent_history,
    _record_exchange,
    _safe_schema_cache,
    serialize_result_preview,
)
from app.core.config import get_settings
from app.core.security import verify_password
from app.db.session import SessionLocal
from app.models import (
    ChatSession,
    DBConnection,
    Organization,
    QueryLog,
    User,
    WhatsAppBinding,
)
from app.schemas.dto import QueryGenerateResponse
from app.services.agent import AgentError, agent_supported, run_agent
from app.services.ai import (
    Intent,
    QueryUnderstandingError,
    SchemaAnswer,
    classify_question,
    generate_sql,
    summarize_result,
)
from app.services.sql_validator import validate_sql

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
logger = logging.getLogger("querymind.whatsapp")

GRAPH_BASE = "https://graph.facebook.com"
MAX_TABLE_ROWS = 8
MAX_CELL_WIDTH = 28
TABLE_MAX_COLUMNS = 6
MAX_MESSAGE_CHARS = 4000  # WhatsApp hard-caps messages at 4096 chars
CHART_MAX_ROWS = 12
_TEMPORAL_LABEL_RE = re.compile(r"date|month|year|day|week|quarter|time", re.IGNORECASE)
_NUMBER_RE = re.compile(r"\D")

# Meta redelivers webhooks on timeout/retry; this window absorbs duplicates.
_DEDUPE_TTL_SECONDS = 48 * 3600
_DEDUPE_MAX_ENTRIES = 10_000
_seen_lock = threading.Lock()
_seen_messages: "OrderedDict[str, float]" = OrderedDict()

HELP_TEXT = (
    "*QueryMind on WhatsApp*\n"
    "Ask any question about your connected database and I'll answer in plain "
    "language - with tables and charts when they help.\n\n"
    "Examples:\n"
    "- How many orders did we get last month?\n"
    "- Top 5 customers by revenue\n"
    "- Sales trend per month\n\n"
    "Commands:\n"
    "*help* - this message\n"
    "*new chat* - start a fresh conversation\n"
    "*disconnect* - unlink this WhatsApp number"
)

_PAIRING_UNCONFIGURED_TEXT = (
    "Pairing is not set up on this server yet (missing WHATSAPP_CONNECT_BASE_URL). "
    "Please ask the admin to finish the configuration."
)


def _clean_number(value: str) -> str:
    return _NUMBER_RE.sub("", value or "")


def _mark_seen(message_id: str) -> bool:
    """True the first time an id is seen; False on Meta redeliveries."""
    now = time.time()
    with _seen_lock:
        if message_id in _seen_messages:
            return False
        _seen_messages[message_id] = now
        while len(_seen_messages) > _DEDUPE_MAX_ENTRIES:
            _seen_messages.popitem(last=False)
        stale = [key for key, ts in _seen_messages.items() if now - ts > _DEDUPE_TTL_SECONDS]
        for key in stale:
            _seen_messages.pop(key, None)
        return True


def _signature_valid(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature_header or "")


def _allowed(sender: str) -> bool:
    """Testing-only gate; production auth is per-user via pairing."""
    raw = get_settings().whatsapp_allowed_numbers
    allowed = {_clean_number(entry) for entry in raw.split(",") if entry.strip()}
    if not allowed:
        return True
    return _clean_number(sender) in allowed


# Display number of the bot, fetched from Graph and cached so the public
# status endpoint stays cheap (the frontend builds a wa.me link from it).
_NUMBER_CACHE_TTL_SECONDS = 600
_number_cache_lock = threading.Lock()
_number_cache: dict = {"at": 0.0, "number": None}


def _bot_display_number() -> str | None:
    now = time.time()
    with _number_cache_lock:
        if _number_cache["number"] and now - _number_cache["at"] < _NUMBER_CACHE_TTL_SECONDS:
            return _number_cache["number"]

    settings = get_settings()
    number = None
    try:
        response = httpx.get(
            f"{GRAPH_BASE}/{settings.whatsapp_graph_version}/{settings.whatsapp_phone_number_id}",
            params={
                "fields": "display_phone_number",
                "access_token": settings.whatsapp_access_token,
            },
            timeout=6,
        )
        if response.status_code == 200:
            number = (response.json() or {}).get("display_phone_number") or None
    except (httpx.HTTPError, ValueError):
        number = None
    with _number_cache_lock:
        _number_cache["at"] = now
        _number_cache["number"] = number
    return number


@router.get("/status")
def status():
    # Terse on purpose: this endpoint is public and must not disclose numbers,
    # ids, or which parts of the configuration are missing.
    settings = get_settings()
    try:
        import matplotlib  # noqa: F401

        charts = True
    except ImportError:
        charts = False
    payload: dict = {"ready": settings.whatsapp_configured, "charts": charts}
    if settings.whatsapp_configured:
        payload["number"] = _bot_display_number()
    return payload


@router.get("/webhook")
def verify_webhook(request: Request):
    settings = get_settings()
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and settings.whatsapp_verify_token
        and params.get("hub.verify_token") == settings.whatsapp_verify_token
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    logger.warning("whatsapp_webhook_verification_failed")
    return JSONResponse({"detail": "Verification failed"}, status_code=403)


@router.post("/webhook")
async def receive(request: Request):
    settings = get_settings()
    if not settings.whatsapp_configured:
        return JSONResponse({"detail": "WhatsApp bot is not configured"}, status_code=503)

    raw_body = await request.body()
    if settings.whatsapp_app_secret:
        if not _signature_valid(
            raw_body,
            request.headers.get("x-hub-signature-256", ""),
            settings.whatsapp_app_secret,
        ):
            logger.warning("whatsapp_webhook_bad_signature")
            return JSONResponse({"detail": "Invalid signature"}, status_code=403)
    elif settings.is_production:
        logger.error("whatsapp_webhook_missing_app_secret_in_production")
        return JSONResponse({"detail": "App secret is required in production"}, status_code=503)
    else:
        logger.warning("whatsapp_webhook_unsigned_dev_mode")

    try:
        envelope = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse({"detail": "Unreadable payload"}, status_code=400)
    if not isinstance(envelope, dict):
        return JSONResponse({"detail": "Unreadable payload"}, status_code=400)

    for entry in envelope.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")
            if phone_number_id != settings.whatsapp_phone_number_id:
                logger.warning(
                    "whatsapp_webhook_unknown_phone_number_id received=%s", phone_number_id
                )
                continue
            for message in value.get("messages", []):
                dispatch_message(message)
    # Always ack quickly: Meta retries non-2xx webhooks, and slow responses
    # eventually degrade the app's webhook quality rating.
    return {"received": True}


def dispatch_message(message: dict) -> None:
    """Ack immediately, then answer in the background (or inline on serverless)."""
    settings = get_settings()
    sender = str(message.get("from", ""))
    message_id = str(message.get("id", ""))
    text = _extract_text(message)

    if not message_id or not text:
        logger.info("whatsapp_message_ignored unsupported_type=%s", message.get("type"))
        return
    if not _mark_seen(message_id):
        logger.info("whatsapp_duplicate_suppressed id=%s", message_id[-12:])
        return
    if not _allowed(sender):
        logger.warning("whatsapp_sender_not_allowed sender_tail=%s", sender[-4:])
        return

    if settings.whatsapp_inline_processing:
        _process_message(_clean_number(sender), text)
    else:
        threading.Thread(
            target=_process_message,
            args=(_clean_number(sender), text),
            name=f"whatsapp-{sender[-4:]}",
            daemon=True,
        ).start()


def _extract_text(message: dict) -> str:
    kind = message.get("type")
    if kind == "text":
        return str(message.get("text", {}).get("body", "")).strip()
    # Quick-reply buttons and list replies arrive as their own payload shapes;
    # treat the chosen option as ordinary text so follow-ups keep working.
    if kind == "button":
        return str(message.get("button", {}).get("text", "")).strip()
    if kind == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return str(reply.get("title", "")).strip()
    return ""


# ---------------------------------------------------------------------------
# Pairing: stateless signed connect tokens + the /whatsapp/connect page.
# The token only ever says "this WhatsApp number wants to pair" - credentials
# are entered on the normal web login flow, never inside WhatsApp.
# ---------------------------------------------------------------------------


def _make_connect_token(wa_number: str) -> str:
    settings = get_settings()
    expires_at = int(time.time()) + settings.whatsapp_connect_token_ttl_minutes * 60
    payload = f"{wa_number}.{expires_at}"
    signature = hmac.new(
        settings.jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    raw = f"{payload}.{signature}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _read_connect_token(token: str) -> str | None:
    """Return the wa_number for a valid, unexpired token; None otherwise."""
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        wa_number, expires_at, signature = raw.split(".")
    except (ValueError, UnicodeDecodeError):
        return None
    payload = f"{wa_number}.{expires_at}"
    expected = hmac.new(
        get_settings().jwt_secret_key.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        if int(expires_at) < time.time():
            return None
    except ValueError:
        return None
    return _clean_number(wa_number) or None


_PAGE_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Viewport meta is what makes the page render at phone width instead of
     a zoomed-out desktop canvas when opened from WhatsApp on mobile. -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>QueryMind - WhatsApp</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f1f5f9;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 16px;
    -webkit-text-size-adjust: 100%;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 30px rgba(2, 6, 23, .08);
    padding: 28px 22px;
    width: 100%;
    max-width: 380px;
  }
  .logo {
    width: 44px; height: 44px; border-radius: 12px;
    background: #0f766e; color: #fff;
    display: grid; place-items: center;
    font-weight: 800; font-size: 18px; margin-bottom: 16px;
  }
  h1 { font-size: 20px; margin: 0 0 6px; color: #0f172a; line-height: 1.3; }
  p  { color: #475569; line-height: 1.55; font-size: 14px; margin: 0 0 14px; }
  .error { color: #be123c; font-size: 13px; margin: 0 0 12px; }
  .ok    { color: #0f766e; font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
  .hint  { color: #94a3b8; font-size: 12px; margin: 16px 0 0; }
  form { display: grid; gap: 12px; }
  /* 16px input font size prevents iOS Safari from auto-zooming on focus. */
  input {
    width: 100%; border: 1px solid #cbd5e1; border-radius: 10px;
    padding: 12px 14px; font-size: 16px; color: #0f172a; background: #fff;
  }
  input:focus { outline: 2px solid #0f766e; outline-offset: 1px; border-color: #0f766e; }
  button {
    width: 100%; background: #0f766e; color: #fff; border: 0; border-radius: 10px;
    padding: 13px; font-size: 16px; font-weight: 700; cursor: pointer;
  }
  button:active { background: #115e59; }
</style>
</head>
<body>
<div class="card">
<div class="logo">Q</div>
"""

_PAGE_TAIL = """
</div>
</body>
</html>"""


def _page(body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(_PAGE_HEAD + body + _PAGE_TAIL, status_code=status_code)


def _mask_email(email: str) -> str:
    """Show enough to recognise the account, little enough to stay private."""
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    return f"{local[:1]}***@{domain}"


@router.get("/connect")
def connect_page(token: str = "", error: str = "") -> HTMLResponse:
    wa_number = _read_connect_token(token)
    if wa_number is None:
        return _page(
            "<h1>Link expired</h1>"
            "<p>This login link is invalid or has expired. Send a new message to the "
            "QueryMind WhatsApp bot to get a fresh one.</p>",
            status_code=400,
        )

    # Already paired? Tell the user instead of showing a bare form - signing in
    # again is still allowed (it switches accounts; last login wins).
    paired_html = ""
    db = SessionLocal()
    try:
        binding = _binding_for(db, wa_number)
        if binding is not None:
            bound_user = db.get(User, binding.user_id)
            if bound_user is not None:
                paired_html = (
                    '<p class="ok">&#10003; This number is already connected to '
                    f"<b>{_mask_email(bound_user.email)}</b>. Continue chatting in "
                    "WhatsApp, or sign in below to switch accounts.</p>"
                )
    finally:
        db.close()

    error_html = f'<p class="error">{error}</p>' if error else ""
    form = (
        "<h1>Connect WhatsApp</h1>"
        f'<p>Linking number <b>&middot;&middot;&middot;{wa_number[-4:]}</b> to your '
        "QueryMind account.</p>"
        f"{paired_html}"
        f"{error_html}"
        f"<form method=\"post\" action=\"/whatsapp/connect?token={token}\">"
        '<input name="email" type="email" required placeholder="Work email" '
        'autocomplete="email" inputmode="email"/>'
        '<input name="password" type="password" required placeholder="Password" '
        'autocomplete="current-password"/>'
        '<button type="submit">Sign in &amp; link</button>'
        "</form>"
        '<p class="hint">Never enter your password inside WhatsApp itself - '
        "we will never ask for it there.</p>"
    )
    return _page(form)


@router.post("/connect")
async def connect_submit(request: Request, token: str = "") -> HTMLResponse:
    wa_number = _read_connect_token(token)
    if wa_number is None:
        return connect_page(token="", error="expired")
    form = parse_qs((await request.body()).decode("utf-8"))
    email = (form.get("email") or [""])[0].strip().lower()
    password = (form.get("password") or [""])[0]

    def back_with_error(message: str) -> HTMLResponse:
        # Re-present the same one-time link instead of burning it on a typo.
        return HTMLResponse(
            status_code=303,
            headers={"Location": f"/whatsapp/connect?token={token}&error={quote(message)}"},
        )

    if not email or not password:
        return back_with_error("Please fill in both fields.")
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None or not verify_password(password, user.hashed_password):
            logger.info("whatsapp_pairing_failed_login sender_tail=%s", wa_number[-4:])
            return back_with_error("Invalid email or password.")
        _bind_number(db, wa_number, user)
    finally:
        db.close()
    logger.info("whatsapp_paired sender_tail=%s", wa_number[-4:])
    return _page(
        "<h1>WhatsApp connected &#10003;</h1>"
        f"<p>Number <b>&middot;&middot;&middot;{wa_number[-4:]}</b> is now linked to "
        f"<b>{email}</b>.</p>"
        "<p>You can close this page and continue the conversation in WhatsApp.</p>",
    )


def _binding_for(db: Session, wa_number: str) -> WhatsAppBinding | None:
    return db.scalar(select(WhatsAppBinding).where(WhatsAppBinding.wa_number == wa_number))


def _bind_number(db: Session, wa_number: str, user: User) -> None:
    """One number maps to one account; the most recent login wins."""
    binding = _binding_for(db, wa_number)
    if binding is not None:
        binding.user_id = user.id
        binding.organization_id = user.organization_id
    else:
        db.add(
            WhatsAppBinding(
                organization_id=user.organization_id,
                user_id=user.id,
                wa_number=wa_number,
            )
        )
    try:
        db.commit()
    except IntegrityError:  # concurrent first pairing raced on the number
        db.rollback()
        existing = _binding_for(db, wa_number)
        if existing is not None:
            existing.user_id = user.id
            existing.organization_id = user.organization_id
            db.commit()


def _welcome_text(wa_number: str) -> str:
    settings = get_settings()
    base = settings.whatsapp_connect_base_url.rstrip("/")
    if not base:
        return _PAIRING_UNCONFIGURED_TEXT
    link = f"{base}/whatsapp/connect?token={_make_connect_token(wa_number)}"
    ttl = settings.whatsapp_connect_token_ttl_minutes
    return (
        "*Welcome to QueryMind on WhatsApp!* \n"
        "Ask questions about your connected database in plain language and I'll answer "
        "with tables and charts.\n\n"
        f"First, link this number to your account. Tap your personal login link "
        f"(valid for {ttl} min):\n{link}\n\n"
        "After signing in there, just come back here and ask me anything.\n"
        "Send *help* anytime."
    )


def _process_message(sender: str, text: str) -> None:
    lowered = text.lower().strip()
    if lowered in {"help", "menu", "start"}:
        _send_text(sender, HELP_TEXT)
        return

    db = SessionLocal()
    try:
        binding = _binding_for(db, sender)
        if binding is None:
            _send_text(sender, _welcome_text(sender))
            return
        user = db.get(User, binding.user_id)
        if user is None:  # account deleted after pairing - force re-pairing
            db.delete(binding)
            db.commit()
            _send_text(sender, _welcome_text(sender))
            return
        org = db.get(Organization, user.organization_id)

        if lowered in {"disconnect", "unlink", "logout"}:
            db.delete(binding)
            db.commit()
            _send_text(sender, "This WhatsApp number is unlinked. Send any message to pair again.")
            return

        session = _session_for(db, org.id, user.id, sender)
        if lowered in {"new chat", "reset"}:
            fresh = ChatSession(
                organization_id=org.id,
                user_id=user.id,
                connection_id=session.connection_id,
                title=f"WhatsApp ···{sender[-4:]}",
            )
            db.add(fresh)
            db.commit()
            _send_text(sender, "Started a new chat. Ask me anything about your database.")
            return

        connection = _resolve_connection(db, org.id, session)
        if connection is None:
            _send_text(
                sender,
                "Your workspace has no database connected yet. "
                "Connect one in the QueryMind web app first.",
            )
            return
        if session.connection_id != connection.id:
            session.connection_id = connection.id
            db.commit()

        # The pipeline (intent + SQL + execution) can take several seconds;
        # acknowledge immediately so the chat doesn't feel dead.
        _send_text(sender, "⏳ Working on it - querying your database and preparing the answer…")
        answer = _answer_question(db, org, user, session, connection, text)
        _send_text(sender, answer.text)
        table_png = _render_table_png(answer.columns, answer.rows)
        if table_png is not None:
            caption = f"Result table - {len(answer.rows)} row(s)"
            if len(answer.rows) > MAX_TABLE_ROWS:
                caption += f" (showing first {MAX_TABLE_ROWS})"
            if len(answer.columns) > TABLE_MAX_COLUMNS:
                caption += f" - {len(answer.columns) - TABLE_MAX_COLUMNS} more column(s)"
            _send_image(sender, table_png, caption)
        chart_png = _maybe_chart(answer.columns, answer.rows)
        if chart_png is not None:
            _send_image(sender, chart_png, answer.caption[:1000])
    except Exception:
        logger.exception("whatsapp_processing_failed")
        try:
            _send_text(sender, "Something went wrong on my side. Please try again in a moment.")
        except Exception:
            logger.exception("whatsapp_error_reply_failed")
    finally:
        db.close()


def _session_for(db: Session, organization_id: int, user_id: int, sender: str) -> ChatSession:
    """Each paired number gets its own conversation under its own account."""
    session = db.scalar(
        select(ChatSession)
        .where(ChatSession.organization_id == organization_id, ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc().nullslast(), ChatSession.id.desc())
        .limit(1)
    )
    if session is None:
        session = ChatSession(
            organization_id=organization_id,
            user_id=user_id,
            title=f"WhatsApp ···{sender[-4:]}",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def _resolve_connection(db: Session, organization_id: int, session: ChatSession) -> DBConnection | None:
    """The chat stays pinned to its database; otherwise fall back to the
    workspace's first connection."""
    if session.connection_id is not None:
        pinned = db.scalar(
            select(DBConnection).where(
                DBConnection.id == session.connection_id,
                DBConnection.organization_id == organization_id,
            )
        )
        if pinned is not None:
            return pinned
    return db.scalar(
        select(DBConnection)
        .where(DBConnection.organization_id == organization_id)
        .order_by(DBConnection.id.asc())
        .limit(1)
    )


class _Answer:
    def __init__(self, text: str, caption: str = "", columns=None, rows=None):
        self.text = text
        self.caption = caption or text
        self.columns = columns or []
        self.rows = rows or []


def _answer_question(
    db: Session,
    org: Organization,
    user: User,
    session: ChatSession,
    connection: DBConnection,
    question: str,
) -> _Answer:
    settings = get_settings()
    deadline = time.monotonic() + settings.whatsapp_time_budget_seconds
    schema = _safe_schema_cache(connection)
    history = _recent_history(db, user, session.id)
    ai_config = ai_config_for_org(org)
    db_type = connection.db_type or "mysql"

    def log_query(sql: str, query_type: str, state: str, columns: list[str], rows: list[dict]) -> int:
        entry = QueryLog(
            organization_id=org.id,
            user_id=user.id,
            connection_id=connection.id,
            natural_language=question,
            generated_sql=sql,
            query_type=query_type,
            status=state,
            result_preview=serialize_result_preview(columns, rows),
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry.id

    def finish(response: QueryGenerateResponse, caption: str | None = None) -> _Answer:
        # Reuse the web app's transcript writer so WhatsApp conversations show
        # up in the SAME account's chat history as normal chats.
        _record_exchange(db, session, question, response)
        return _Answer(response.summary, caption or response.summary, response.columns, response.rows)

    # Analytical questions go through the multi-step agent first.
    if agent_supported(ai_config) and not _is_followup_answer(session, db):
        try:
            intent: Intent = classify_question(question, schema, history, ai_config, db_type=db_type)
        except Exception:
            intent = Intent()
        if intent.clarification:
            return finish(QueryGenerateResponse(summary=intent.clarification, needs_clarification=True))
        if intent.analytical and time.monotonic() < deadline:
            agent_response = _run_agent_path(
                question, schema, history, ai_config, deadline, db_type, connection, log_query
            )
            if agent_response is not None:
                return finish(agent_response)

    try:
        sql = generate_sql(question, schema, history, ai_config, db_type=db_type)
    except SchemaAnswer as exc:
        return finish(QueryGenerateResponse(summary=exc.text, meta_answer=True))
    except QueryUnderstandingError as exc:
        return finish(QueryGenerateResponse(summary=str(exc), needs_clarification=True))

    validation = validate_sql(sql, schema)
    if not validation.ok:
        return finish(QueryGenerateResponse(summary=validation.error, needs_clarification=True))

    if validation.requires_confirmation:
        # Writes never run from a chat channel: confirm them in the web app.
        log_query(sql, validation.query_type, "pending_confirmation", [], [])
        return finish(
            QueryGenerateResponse(
                sql=sql,
                query_type=validation.query_type,
                requires_confirmation=True,
                summary=(
                    "This looks like a data change (write) request. For safety I don't "
                    "execute writes from WhatsApp - open QueryMind in your browser and "
                    "confirm it there.\n"
                    f"```{sql[:500]}```"
                ),
            )
        )

    connector = build_connector(connection)
    try:
        columns, rows = connector.execute(sql)
    except Exception:
        logger.exception("whatsapp_query_execution_failed")
        return finish(
            QueryGenerateResponse(
                sql=sql,
                query_type=validation.query_type,
                summary="Your database rejected this question. Try rephrasing it.",
            )
        )
    finally:
        connector.close()

    summary = summarize_result(
        question, columns, rows, False, query_type=validation.query_type, ai_config=ai_config
    )
    if getattr(connector, "last_truncated", False):
        summary += f" (showing the first {len(rows)} rows)"
    query_id = log_query(sql, validation.query_type, "executed", columns, rows)
    return finish(
        QueryGenerateResponse(
            query_id=query_id,
            sql=sql,
            query_type=validation.query_type,
            summary=summary,
            columns=columns,
            rows=rows,
        ),
        caption=summary,
    )


def _run_agent_path(
    question: str,
    schema: dict,
    history: list[dict],
    ai_config,
    deadline: float,
    db_type: str,
    connection: DBConnection,
    log_query,
) -> QueryGenerateResponse | None:
    connector = build_connector(connection)

    def execute(sql: str):
        return connector.execute(sql)

    try:
        result = run_agent(question, schema, execute, history, ai_config, deadline, db_type=db_type)
    except (AgentError, httpx.HTTPError, RuntimeError):
        return None
    finally:
        connector.close()

    if getattr(connector, "last_truncated", False):
        result.summary += f" (showing the first {len(result.rows)} rows)"
    query_id = log_query(
        result.sql or "-- agent analysis (no single query)",
        "SELECT",
        "executed",
        result.columns,
        result.rows,
    )
    return QueryGenerateResponse(
        query_id=query_id,
        sql=result.sql,
        query_type="SELECT",
        summary=result.summary,
        columns=result.columns,
        rows=result.rows,
        steps=result.steps,
    )


def _render_table_png(columns: list[str], rows: list[dict]) -> bytes | None:
    """Render the result table as a styled PNG image (WhatsApp has no native
    table rendering, and an image beats monospace text on phones)."""
    if not columns or not rows:
        return None
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.info("whatsapp_table_skipped matplotlib_unavailable")
        return None

    shown_columns = [str(column)[:MAX_CELL_WIDTH] for column in columns[:TABLE_MAX_COLUMNS]]
    shown_rows = rows[:MAX_TABLE_ROWS]
    cell_text = [
        [str(row.get(column, ""))[:MAX_CELL_WIDTH] for column in columns[:TABLE_MAX_COLUMNS]]
        for row in shown_rows
    ]

    try:
        widest_cell = max(
            [len(column) for column in shown_columns]
            + [len(cell) for row in cell_text for cell in row]
            or [8]
        )
        fig_width = min(14.0, max(5.0, 0.11 * widest_cell * len(shown_columns) + 1.5))
        fig_height = max(1.8, 0.42 * (len(shown_rows) + 1) + 0.8)
        fig, axis = plt.subplots(figsize=(fig_width, fig_height), dpi=150)
        axis.axis("off")

        table = axis.table(
            cellText=cell_text,
            colLabels=shown_columns,
            loc="upper center",
            cellLoc="left",
        )
        table.auto_set_font_size(False)
        table.set_fontsize(9)
        table.scale(1, 1.6)
        for (row_index, _col_index), cell in table.get_celld().items():
            cell.set_edgecolor("#e2e8f0")
            if row_index == 0:
                cell.set_facecolor("#0f766e")
                cell.set_text_props(color="white", fontweight="bold")
            elif row_index % 2 == 0:
                cell.set_facecolor("#f1f5f9")
            else:
                cell.set_facecolor("#ffffff")

        import io

        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        return buffer.getvalue()
    except Exception:
        logger.exception("whatsapp_table_render_failed")
        return None
    finally:
        plt.close("all")


def _as_float(value) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _maybe_chart(columns: list[str], rows: list[dict]) -> bytes | None:
    """Render a PNG when the shape of the result clearly benefits from one."""
    if len(rows) < 2 or len(rows) > CHART_MAX_ROWS or len(columns) < 2:
        return None

    label_column: str | None = None
    numeric_columns: list[str] = []
    for column in columns:
        values = [row.get(column) for row in rows]
        usable = [value for value in values if value is not None and str(value).strip() != ""]
        if not usable:
            continue
        numeric_ratio = sum(1 for value in usable if _as_float(value) is not None) / len(usable)
        if numeric_ratio >= 0.8:
            numeric_columns.append(column)
        elif label_column is None:
            label_column = column
    if label_column is None or not numeric_columns:
        return None

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.info("whatsapp_chart_skipped matplotlib_unavailable")
        return None

    labels = [str(row.get(label_column, ""))[:20] for row in rows]
    try:
        fig, axis = plt.subplots(figsize=(7.0, 3.5), dpi=150)
        x = range(len(labels))
        if _TEMPORAL_LABEL_RE.search(label_column):
            for column in numeric_columns[:2]:
                axis.plot(x, [_as_float(row.get(column)) or 0 for row in rows], marker="o", label=column)
        else:
            series = numeric_columns[:2]
            width = 0.8 / len(series)
            for index, column in enumerate(series):
                offset = (index - (len(series) - 1) / 2) * width
                axis.bar(
                    [i + offset for i in x],
                    [_as_float(row.get(column)) or 0 for row in rows],
                    width,
                    label=column,
                )
        axis.set_xticks(list(x))
        axis.set_xticklabels(labels, rotation=30, ha="right", fontsize=8)
        axis.legend(fontsize=8)
        axis.grid(axis="y", alpha=0.3)
        axis.spines["top"].set_visible(False)
        axis.spines["right"].set_visible(False)
        fig.tight_layout()

        import io

        buffer = io.BytesIO()
        fig.savefig(buffer, format="png")
        return buffer.getvalue()
    except Exception:
        logger.exception("whatsapp_chart_render_failed")
        return None
    finally:
        plt.close("all")


def _graph_url(path: str) -> str:
    settings = get_settings()
    return f"{GRAPH_BASE}/{settings.whatsapp_graph_version}/{settings.whatsapp_phone_number_id}/{path}"


def _graph_headers() -> dict:
    return {"Authorization": f"Bearer {get_settings().whatsapp_access_token}"}


def _post_graph(payload: dict) -> dict:
    response = httpx.post(_graph_url("messages"), json=payload, headers=_graph_headers(), timeout=20)
    data = response.json() if response.content else {}
    if response.status_code >= 400:
        logger.error("whatsapp_send_failed status=%s body=%s", response.status_code, data)
    return data


def _send_text(to: str, body: str) -> None:
    # Respect the hard 4096-char cap by splitting on line boundaries.
    remaining = body.strip() or "(empty reply)"
    while remaining:
        chunk, remaining = _split_message(remaining)
        _post_graph(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"preview_url": True, "body": chunk},
            }
        )


def _split_message(text: str) -> tuple[str, str]:
    if len(text) <= MAX_MESSAGE_CHARS:
        return text, ""
    cut = text.rfind("\n", 0, MAX_MESSAGE_CHARS)
    if cut < MAX_MESSAGE_CHARS // 2:
        cut = text.rfind(" ", 0, MAX_MESSAGE_CHARS)
    if cut <= 0:
        cut = MAX_MESSAGE_CHARS
    return text[:cut].rstrip(), text[cut:].lstrip("\n")


def _send_image(to: str, png_bytes: bytes, caption: str) -> bool:
    try:
        upload = httpx.post(
            _graph_url("media"),
            files={"file": ("chart.png", png_bytes, "image/png")},
            data={"messaging_product": "whatsapp", "type": "image/png"},
            headers=_graph_headers(),
            timeout=30,
        )
        media_id = (upload.json() or {}).get("id") if upload.content else None
        if upload.status_code >= 400 or not media_id:
            logger.error("whatsapp_media_upload_failed status=%s", upload.status_code)
            return False
        _post_graph(
            {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "image",
                "image": {"id": media_id, "caption": caption},
            }
        )
        return True
    except httpx.HTTPError:
        logger.exception("whatsapp_media_upload_error")
        return False
