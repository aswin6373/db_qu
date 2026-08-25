import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.connections import _get_org_connection, build_connector
from app.api.dependencies import get_current_user
from app.api.organizations import ai_config_for_org
from app.db.session import get_db
from app.models import ChatSession, Message, Organization, QueryLog, User
from app.schemas.dto import QueryGenerateRequest, QueryGenerateResponse
from app.services.ai import QueryUnderstandingError, SchemaAnswer, evaluate_clarity, generate_sql, schema_meta_answer, summarize_result
from app.services.sql_validator import validate_sql

router = APIRouter(prefix="/query", tags=["query"])


def serialize_result_preview(columns: list[str], rows: list[dict]) -> str:
    return json.dumps({"columns": columns, "rows": rows[:5]}, default=str)


def _result_payload(
    query_id: int,
    sql: str,
    query_type: str,
    requires_confirmation: bool,
    summary: str,
    columns: list[str],
    rows: list[dict],
) -> dict:
    return {
        "query_id": query_id,
        "sql": sql,
        "query_type": query_type,
        "requires_confirmation": requires_confirmation,
        "summary": summary,
        "columns": columns,
        "rows": rows,
    }


def _org_chat_session(session_id: int, user: User, db: Session) -> ChatSession:
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.organization_id == user.organization_id,
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


def _record_exchange(db: Session, session: ChatSession, question: str, response: QueryGenerateResponse) -> None:
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
                    ),
                    default=str,
                ),
            )
        )
    if session.title == "New chat":
        session.title = question.strip()[:80] or "New chat"
    session.updated_at = datetime.utcnow()
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
    session.updated_at = datetime.utcnow()
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
    return [{"role": message.role, "content": message.content} for message in reversed(rows)]


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
    schema = json.loads(connection.schema_cache or "{}")
    history = _recent_history(db, user, payload.session_id)
    ai_config = ai_config_for_org(db.get(Organization, user.organization_id))

    def clarification_response(text: str) -> QueryGenerateResponse:
        response = QueryGenerateResponse(summary=text, needs_clarification=True)
        if payload.session_id is not None:
            chat_session = _org_chat_session(payload.session_id, user, db)
            _record_exchange(db, chat_session, payload.question, response)
        return response

    def direct_answer(text: str) -> QueryGenerateResponse:
        # Schema questions ("what tables do I have?") are answered like a human — no SQL.
        response = QueryGenerateResponse(summary=text, needs_clarification=False, meta_answer=True)
        if payload.session_id is not None:
            chat_session = _org_chat_session(payload.session_id, user, db)
            _record_exchange(db, chat_session, payload.question, response)
        return response

    # Questions about the database itself are answered directly from the schema,
    # before the AI clarity/SQL steps ever run.
    try:
        meta_text = schema_meta_answer(payload.question, schema)
    except Exception:
        meta_text = None
    if meta_text:
        return direct_answer(meta_text)

    try:
        clarifying_question = evaluate_clarity(payload.question, schema, history, ai_config)
    except Exception:
        clarifying_question = None
    if clarifying_question:
        return clarification_response(clarifying_question)

    try:
        sql = generate_sql(payload.question, schema, history, ai_config)
    except SchemaAnswer as exc:
        return direct_answer(exc.text)
    except QueryUnderstandingError as exc:
        return clarification_response(str(exc))
    validation = validate_sql(sql, schema)
    if not validation.ok:
        return clarification_response(validation.error)

    columns: list[str] = []
    rows: list[dict] = []
    status = "pending_confirmation" if validation.requires_confirmation else "executed"

    if not validation.requires_confirmation:
        try:
            columns, rows = build_connector(connection).execute(sql)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Database query failed: {exc}") from exc

    summary = summarize_result(
        payload.question, columns, rows, validation.requires_confirmation, query_type=validation.query_type,
        ai_config=ai_config,
    )
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
    response = QueryGenerateResponse(
        query_id=log.id,
        sql=sql,
        query_type=validation.query_type,
        requires_confirmation=validation.requires_confirmation,
        summary=summary,
        columns=columns,
        rows=rows,
    )
    if payload.session_id is not None:
        chat_session = _org_chat_session(payload.session_id, user, db)
        _record_exchange(db, chat_session, payload.question, response)
    return response


@router.post("/{query_id}/confirm", response_model=QueryGenerateResponse)
def confirm(query_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = db.scalar(
        select(QueryLog).where(QueryLog.id == query_id, QueryLog.organization_id == user.organization_id)
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Query not found")
    if log.status != "pending_confirmation":
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="This write query was already confirmed.",
        )
        _finalize_confirmed_message(db, user, query_id, response)
        return response
    if log.connection_id is None:
        log.status = "executed"
        db.commit()
        response = QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="Demo write query confirmed. Add a real connection to execute against MySQL.",
        )
        _finalize_confirmed_message(db, user, query_id, response)
        return response

    connection = _get_org_connection(log.connection_id, user, db)
    try:
        columns, rows = build_connector(connection).execute(log.generated_sql)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Database query failed: {exc}") from exc
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
