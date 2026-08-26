import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.connections import _get_org_connection, build_connector
from app.api.dependencies import get_current_user
from app.api.organizations import ai_config_for_org
from app.core.config import get_settings
from app.db.session import get_db
from app.models import ChatSession, Message, Organization, QueryLog, User
from app.schemas.dto import QueryGenerateRequest, QueryGenerateResponse
from app.services.ai import (
    Intent,
    QueryUnderstandingError,
    SchemaAnswer,
    _detect_schema_change_request,
    classify_question,
    compress_history,
    decide_visualization,
    generate_sql,
    summarize_result,
)
from app.services.agent import AgentError, agent_supported, run_agent
from app.services.sql_validator import validate_sql

router = APIRouter(prefix="/query", tags=["query"])
logger = logging.getLogger("querymind")


def _utcnow() -> datetime:
    # Naive UTC to match the server_default func.now() columns.
    return datetime.now(timezone.utc).replace(tzinfo=None)

# Questions that benefit from multi-step reasoning get the agent; everything
# else stays on the fast one-shot pipeline. Superlatives like "biggest table"
# belong here: answering them requires discovering sizes first, which a single
# generated query cannot do.
_AGENT_HINT_RE = re.compile(
    r"\b(?:why|how come|compare|comparison|versus|trend|over time|growth|drop|dropped|decline|"
    r"increase|decrease|correlat\w*|relationship|break\s?down|insight|"
    r"biggest|largest|smallest|busiest|"
    r"rank|ranking|ranked|distribution|outliers?|anomal\w*|unusual|forecast)\b"
    r"|\bmost\s+(?:active|popular|common|frequent|valuable|profitable)\b"
    r"|\bper\s+(?:month|week|day|quarter|year)\b"
    r"|\bby\s+(?:month|week|quarter|year|category|region|status)\b"
    r"|\bwhich\s+[\w ]{0,30}?\b(?:most|least|best|worst|highest|lowest)\b"
    r"|\btop\s+\d+\b",
    re.IGNORECASE,
)
_WRITE_INTENT_RE = re.compile(
    r"\b(?:insert|update|delete|drop|create|remove|modify|alter|truncate|rename)\b",
    re.IGNORECASE,
)
# Questions whose wording implies aggregation/comparison. Used twice: to avoid
# wasting the intent call on obviously simple reads, and to escalate a naive
# one-shot answer (SELECT * with no grouping) to the agent.
_IMPLIES_AGGREGATION_RE = re.compile(
    r"\b(?:who|which|what)\b[^.?!]{0,40}?\b(?:most|least|best|worst|highest|lowest|top)\b"
    r"|\b(?:average|avg|total|sum|count|how many|compare|comparison|versus|rank\w*)\b",
    re.IGNORECASE,
)
_DEEP_HINT_RE = re.compile(
    r"\b(?:biggest|largest|smallest|busiest|trend|growth|decline|insight|distribution|"
    r"outliers?|anomal\w*|unusual|forecast|relationship|correlat\w*|why|how come|who)\b",
    re.IGNORECASE,
)
# A generated SQL statement this simple cannot answer an aggregation question.
_SQL_HAS_AGGREGATE_RE = re.compile(
    r"\b(?:GROUP\s+BY|SUM\s*\(|COUNT\s*\(|AVG\s*\(|MIN\s*\(|MAX\s*\(|JOIN)\b",
    re.IGNORECASE,
)


def serialize_result_preview(columns: list[str], rows: list[dict]) -> str:
    return json.dumps({"columns": columns, "rows": rows[:5]}, default=str)


def _safe_schema_cache(connection) -> dict:
    """A corrupted schema cache degrades to empty instead of 500-ing."""
    try:
        parsed = json.loads(connection.schema_cache or "{}")
    except (json.JSONDecodeError, TypeError):
        logger.warning("corrupt_schema_cache connection=%s", connection.id)
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _result_payload(
    query_id: int,
    sql: str,
    query_type: str,
    requires_confirmation: bool,
    summary: str,
    columns: list[str],
    rows: list[dict],
    steps: list[dict] | None = None,
    visualization: str = "table",
) -> dict:
    return {
        "query_id": query_id,
        "sql": sql,
        "query_type": query_type,
        "requires_confirmation": requires_confirmation,
        "summary": summary,
        "columns": columns,
        "rows": rows,
        "steps": steps or [],
        "visualization": visualization,
    }


def _org_chat_session(session_id: int, user: User, db: Session) -> ChatSession:
    # Chats are personal: organization membership alone must not grant access
    # to another member's conversation history.
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.organization_id == user.organization_id,
            ChatSession.user_id == user.id,
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


def _record_exchange(
    db: Session,
    session: ChatSession,
    question: str,
    response: QueryGenerateResponse,
    ai_config=None,
    deadline: float | None = None,
) -> None:
    db.add(Message(session_id=session.id, role="user", content=question))
    if response.needs_clarification or response.meta_answer:
        db.add(Message(session_id=session.id, role="assistant", content=response.summary))
    else:
        db.add(
            Message(
                session_id=session.id,
                role="assistant",
                content=response.summary,
                sql=response.sql,
                query_id=response.query_id,
                result_json=json.dumps(
                    _result_payload(
                        response.query_id,
                        response.sql,
                        response.query_type,
                        response.requires_confirmation,
                        response.summary,
                        response.columns,
                        response.rows,
                        response.steps,
                        response.visualization,
                    ),
                    default=str,
                ),
            )
        )
    if session.title == "New chat":
        session.title = question.strip()[:80] or "New chat"
    session.updated_at = _utcnow()
    db.commit()
    _refresh_context_summary(db, session, ai_config, deadline)


def _refresh_context_summary(db: Session, session: ChatSession, ai_config, deadline: float | None) -> None:
    """Keep the rolling conversation summary fresh ("memory").

    Starts once there is real history, then refreshes every other exchange to
    amortize the extra LLM call. Skips itself when the request's time budget
    is nearly spent so the answer always ships first."""
    if ai_config is None or deadline is None:
        return
    count = db.scalar(
        select(func.count()).select_from(Message).where(Message.session_id == session.id)
    )
    count = count or 0
    if count < 6 or count % 2 != 0:
        return
    if time.monotonic() >= deadline - 6:
        return
    recent = db.scalars(
        select(Message)
        .where(Message.session_id == session.id)
        .order_by(Message.id.desc())
        .limit(10)
    ).all()
    summary = compress_history(
        session.context_summary,
        [{"role": message.role, "content": message.content} for message in reversed(recent)],
        ai_config,
    )
    if summary and summary != session.context_summary:
        session.context_summary = summary
        db.commit()


def _finalize_confirmed_message(db: Session, user: User, query_id: int, response: QueryGenerateResponse) -> None:
    pending = db.scalar(
        select(Message)
        .join(ChatSession, Message.session_id == ChatSession.id)
        .where(Message.query_id == query_id, ChatSession.organization_id == user.organization_id)
        .order_by(Message.id.desc())
    )
    if pending is None:
        return
    session = db.get(ChatSession, pending.session_id)
    payload = _result_payload(
        response.query_id,
        response.sql,
        response.query_type,
        False,
        response.summary,
        response.columns,
        response.rows,
    )
    pending.result_json = json.dumps(payload, default=str)
    db.add(
        Message(
            session_id=session.id,
            role="assistant",
            content=response.summary,
            sql=response.sql,
            query_id=response.query_id,
            result_json=json.dumps(payload, default=str),
        )
    )
    session.updated_at = _utcnow()
    db.commit()


def _recent_history(db: Session, user: User, session_id: int | None, limit: int = 8) -> list[dict]:
    if session_id is None:
        return []
    chat_session = _org_chat_session(session_id, user, db)
    rows = db.scalars(
        select(Message)
        .where(Message.session_id == chat_session.id)
        .order_by(Message.id.desc())
        .limit(limit)
    ).all()
    history = [{"role": message.role, "content": message.content} for message in reversed(rows)]
    if chat_session.context_summary:
        # The rolling summary rides along as a system entry so follow-up
        # questions keep the conversation's key facts ("memory"). It survives
        # the turn window - _history_block never drops system entries.
        history.insert(
            0,
            {
                "role": "system",
                "content": (
                    "Summary of the earlier conversation (use it for follow-ups):\n"
                    f"{chat_session.context_summary}"
                ),
            },
        )
    return history


def _mentions_known_schema(question: str, schema: dict) -> bool:
    """True when the question already names a real table or column."""
    lowered = question.lower()
    tables = schema.get("tables") or {}
    for table, meta in tables.items():
        name = str(table).lower()
        variants = {name, name.rstrip("s"), name.replace("_", " ")}
        if any(variant and re.search(rf"\b{re.escape(variant)}\b", lowered) for variant in variants):
            return True
        for column in meta.get("columns", []):
            column_name = str(column.get("name", "")).lower()
            if len(column_name) > 2 and re.search(rf"\b{re.escape(column_name)}\b", lowered):
                return True
    return False


def _is_likely_simple_read(question: str, schema: dict) -> bool:
    """True when the question names a real table/column and carries no
    analytical wording — the intent LLM call is skipped so simple lookups
    stay fast. Anything ambiguous goes through the AI router instead."""
    if _IMPLIES_AGGREGATION_RE.search(question) or _DEEP_HINT_RE.search(question):
        return False
    return _mentions_known_schema(question, schema)


def _is_followup_answer(chat_session: ChatSession | None, db: Session) -> bool:
    """True when the previous assistant turn was a clarifying question or a
    meta answer (both are stored without SQL): the current message is a
    follow-up. The SQL generator already resolves follow-ups from the
    conversation, so the extra clarity LLM call is skipped — it only added
    latency and could ping-pong another clarification forever."""
    if chat_session is None:
        return False
    last = db.scalar(
        select(Message)
        .where(Message.session_id == chat_session.id, Message.role == "assistant")
        .order_by(Message.id.desc())
        .limit(1)
    )
    return last is not None and not last.sql


DEMO_SCHEMA = {
    "tables": {
        "customers": {
            "columns": [
                {"name": "id", "type": "int", "key": "PRI"},
                {"name": "name", "type": "varchar", "key": ""},
                {"name": "email", "type": "varchar", "key": ""},
            ]
        }
    }
}


@router.post("/generate", response_model=QueryGenerateResponse)
def generate(payload: QueryGenerateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = get_settings()
    # Wall-clock budget for the whole request. Once it is spent, optional LLM
    # stages are skipped so the answer still ships before serverless limits
    # (Vercel maxDuration) kill the function and leave the UI spinning.
    deadline = time.monotonic() + settings.query_time_budget_seconds

    chat_session = None
    if payload.session_id is not None:
        chat_session = _org_chat_session(payload.session_id, user, db)

    # A chat is locked to the database chosen when it was created.
    if chat_session is not None and chat_session.connection_id is not None:
        connection_id = chat_session.connection_id
        if payload.connection_id is not None and payload.connection_id != connection_id:
            raise HTTPException(
                status_code=409,
                detail="This chat is linked to another database. Start a new chat to use a different one.",
            )
    else:
        # Legacy chats (or new ones) bind to a database here — once set, it never changes.
        connection_id = payload.connection_id
        if connection_id is None and chat_session is not None:
            raise HTTPException(status_code=400, detail="Pick a database for this chat before asking questions.")
        if chat_session is not None and connection_id is not None:
            chat_session.connection_id = connection_id
            db.commit()

    if connection_id is None:
        raise HTTPException(status_code=400, detail="Connect a database before asking AI questions.")

    connection = _get_org_connection(connection_id, user, db)
    schema = _safe_schema_cache(connection)
    history = _recent_history(db, user, payload.session_id)
    ai_config = ai_config_for_org(db.get(Organization, user.organization_id))

    def clarification_response(text: str) -> QueryGenerateResponse:
        response = QueryGenerateResponse(summary=text, needs_clarification=True, visualization="text")
        if payload.session_id is not None:
            chat_session = _org_chat_session(payload.session_id, user, db)
            _record_exchange(db, chat_session, payload.question, response, ai_config, deadline)
        return response

    def direct_answer(text: str) -> QueryGenerateResponse:
        # Schema questions ("what tables do I have?") are answered like a human — no SQL.
        response = QueryGenerateResponse(
            summary=text, needs_clarification=False, meta_answer=True, visualization="text"
        )
        if payload.session_id is not None:
            chat_session = _org_chat_session(payload.session_id, user, db)
            _record_exchange(db, chat_session, payload.question, response, ai_config, deadline)
        return response

    def run_agent_mode() -> QueryGenerateResponse | None:
        """Multi-step agent attempt; None means it failed and the pipeline should try."""
        connector = build_connector(connection)

        def execute(sql: str):
            return connector.execute(sql)

        try:
            result = run_agent(
                payload.question,
                schema,
                execute,
                history,
                ai_config,
                deadline,
                db_type=connection.db_type or "mysql",
            )
        except (AgentError, httpx.HTTPError, RuntimeError):
            return None
        finally:
            connector.close()

        if getattr(connector, "last_truncated", False):
            result.summary += f" (showing the first {len(result.rows)} rows)"

        log = QueryLog(
            organization_id=user.organization_id,
            user_id=user.id,
            connection_id=connection.id,
            natural_language=payload.question,
            generated_sql=result.sql or "-- agent analysis (no single query)",
            query_type="SELECT",
            status="executed",
            result_preview=serialize_result_preview(result.columns, result.rows),
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        visualization = decide_visualization(
            payload.question, result.columns, result.rows, ai_config, deadline
        )
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=result.sql,
            query_type="SELECT",
            requires_confirmation=False,
            summary=result.summary,
            columns=result.columns,
            rows=result.rows,
            steps=result.steps,
            visualization=visualization,
        )
        if payload.session_id is not None:
            chat_session = _org_chat_session(payload.session_id, user, db)
            _record_exchange(db, chat_session, payload.question, response, ai_config, deadline)
        return response

    # Questions about the database itself are answered conversationally by the
    # AI via the SchemaAnswer path inside generate_sql.
    write_intent = bool(_WRITE_INTENT_RE.search(payload.question))
    agent_eligible = agent_supported(ai_config) and not write_intent

    # Complex analytical questions go to the agent loop first.
    if agent_eligible and _AGENT_HINT_RE.search(payload.question):
        agent_response = run_agent_mode()
        if agent_response is not None:
            return agent_response

    # One combined intent call decides clarification AND whether the question
    # needs the multi-step agent — AI-driven routing that catches typos and
    # phrasings no keyword list can ("whihc have most rows", "who buy most").
    # The keyword regex above only short-circuits the obvious cases; simple
    # lookups that name a real table skip this call entirely to stay fast.
    if (
        not _is_followup_answer(chat_session, db)
        and not _is_likely_simple_read(payload.question, schema)
        and time.monotonic() < deadline
    ):
        try:
            intent: Intent = classify_question(
                payload.question, schema, history, ai_config, db_type=connection.db_type or "mysql"
            )
        except Exception:
            intent = Intent()
        if intent.clarification:
            return clarification_response(intent.clarification)
        if intent.analytical and agent_eligible:
            agent_response = run_agent_mode()
            if agent_response is not None:
                return agent_response

    try:
        sql = generate_sql(payload.question, schema, history, ai_config, db_type=connection.db_type or "mysql")
    except SchemaAnswer as exc:
        return direct_answer(exc.text)
    except QueryUnderstandingError as exc:
        # The pipeline couldn't map the question — give the agent one chance to
        # reason it through (unless it's a policy message like schema changes,
        # or the request has no time budget left for a multi-step loop).
        if (
            agent_eligible
            and not _detect_schema_change_request(payload.question, schema, db_type=connection.db_type or "mysql")
            and time.monotonic() < deadline
        ):
            rescue = run_agent_mode()
            if rescue is not None:
                return rescue
        return clarification_response(str(exc))
    validation = validate_sql(sql, schema)
    if not validation.ok:
        return clarification_response(validation.error)

    columns: list[str] = []
    rows: list[dict] = []
    status = "pending_confirmation" if validation.requires_confirmation else "executed"

    if not validation.requires_confirmation:
        connector = build_connector(connection)
        try:
            columns, rows = connector.execute(sql)
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("query_execution_failed error=%s", exc, exc_info=True)
            raise HTTPException(status_code=400, detail="The database rejected this query. Rephrase the question and try again.") from exc
        finally:
            connector.close()

    # Escalation safety net: an aggregation-shaped question answered by a
    # naive flat SELECT (e.g. "who bought the most" -> SELECT * FROM products)
    # means the one-shot pipeline misread it — let the agent redo the analysis
    # instead of shipping obviously wrong rows.
    if (
        not validation.requires_confirmation
        and agent_eligible
        and _IMPLIES_AGGREGATION_RE.search(payload.question)
        and not _SQL_HAS_AGGREGATE_RE.search(sql)
        and time.monotonic() < deadline
    ):
        rescue = run_agent_mode()
        if rescue is not None:
            return rescue

    if not validation.requires_confirmation and time.monotonic() >= deadline:
        # Time budget spent: skip the summary LLM call and ship the
        # deterministic wording instead of risking a serverless timeout.
        summary = (
            f"Query finished — {len(rows)} row(s) returned."
            if rows
            else "The query ran successfully, but it did not return any rows."
        )
    else:
        summary = summarize_result(
            payload.question, columns, rows, validation.requires_confirmation, query_type=validation.query_type,
            ai_config=ai_config,
        )
    if not validation.requires_confirmation and getattr(connector, "last_truncated", False):
        summary += f" (showing the first {len(rows)} rows)"
    log = QueryLog(
        organization_id=user.organization_id,
        user_id=user.id,
        connection_id=connection.id,
        natural_language=payload.question,
        generated_sql=sql,
        query_type=validation.query_type,
        status=status,
        result_preview=serialize_result_preview(columns, rows),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    visualization = (
        decide_visualization(payload.question, columns, rows, ai_config, deadline)
        if not validation.requires_confirmation
        else "table"
    )
    response = QueryGenerateResponse(
        query_id=log.id,
        sql=sql,
        query_type=validation.query_type,
        requires_confirmation=validation.requires_confirmation,
        summary=summary,
        columns=columns,
        rows=rows,
        visualization=visualization,
    )
    if payload.session_id is not None:
        chat_session = _org_chat_session(payload.session_id, user, db)
        _record_exchange(db, chat_session, payload.question, response, ai_config, deadline)
    return response


@router.post("/{query_id}/confirm", response_model=QueryGenerateResponse)
def confirm(query_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = get_settings()
    log = db.scalar(
        select(QueryLog).where(
        QueryLog.id == query_id,
        QueryLog.organization_id == user.organization_id,
        QueryLog.user_id == user.id,
    )
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Query not found")
    if log.status != "pending_confirmation":
        # Already executed (or expired/claimed by a concurrent request): report
        # state WITHOUT appending another chat message — repeated POSTs must
        # never spam the transcript.
        expired = log.status == "confirmation_expired"
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary=(
                "This confirmation window has expired. Ask again to regenerate the query."
                if expired
                else "This write query was already confirmed."
            ),
        )
        return response

    # Expire stale confirmations: SQL confirmed long after it was generated
    # may no longer match the data its preview described.
    created_at = log.created_at
    if (
        settings.confirmation_ttl_minutes > 0
        and created_at is not None
        and (_utcnow() - created_at).total_seconds() > settings.confirmation_ttl_minutes * 60
    ):
        log.status = "confirmation_expired"
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="This confirmation window has expired. Ask again to regenerate the query.",
        )

    if log.connection_id is None:
        log.status = "executed"
        db.commit()
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="Demo write query confirmed. Add a real connection to execute against your database.",
        )
        _finalize_confirmed_message(db, user, query_id, response)
        return response

    # Claim-then-execute: flip pending → executing in a guarded UPDATE and
    # only proceed when THIS request won the claim. Two concurrent confirms
    # (double-click, retried XHR) can never both run the write.
    claimed = db.execute(
        update(QueryLog)
        .where(QueryLog.id == log.id, QueryLog.status == "pending_confirmation")
        .values(status="executing")
    ).rowcount
    db.commit()
    if not claimed:
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="This write query was already confirmed.",
        )
        return response

    connection = _get_org_connection(log.connection_id, user, db)
    connector = build_connector(connection)
    try:
        columns, rows = connector.execute(log.generated_sql)
    except HTTPException:
        _release_claim(db, log.id)
        raise
    except Exception as exc:
        logger.error("confirm_execution_failed query=%s error=%s", query_id, exc, exc_info=True)
        # Give the row back so the user can retry the same confirmation.
        _release_claim(db, log.id)
        raise HTTPException(
            status_code=400,
            detail="The database rejected this query. Check the connection and try again.",
        ) from exc
    finally:
        connector.close()
    log.status = "executed"
    log.result_preview = serialize_result_preview(columns, rows)
    db.commit()
    response = QueryGenerateResponse(
        query_id=log.id,
        sql=log.generated_sql,
        query_type=log.query_type,
        requires_confirmation=False,
        summary="The confirmed write query executed successfully.",
        columns=columns,
        rows=rows,
    )
    _finalize_confirmed_message(db, user, query_id, response)
    return response


def _release_claim(db: Session, query_id: int) -> None:
    """Return a claimed ('executing') log to pending after a failed execution."""
    db.execute(
        update(QueryLog)
        .where(QueryLog.id == query_id, QueryLog.status == "executing")
        .values(status="pending_confirmation")
    )
    db.commit()
