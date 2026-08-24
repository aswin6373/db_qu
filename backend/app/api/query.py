import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.connections import _get_org_connection, build_connector
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import QueryLog, User
from app.schemas.dto import QueryGenerateRequest, QueryGenerateResponse
from app.services.ai import QueryUnderstandingError, generate_sql, summarize_result
from app.services.sql_validator import validate_sql

router = APIRouter(prefix="/query", tags=["query"])


def serialize_result_preview(columns: list[str], rows: list[dict]) -> str:
    return json.dumps({"columns": columns, "rows": rows[:5]}, default=str)


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
    if payload.connection_id is None:
        raise HTTPException(status_code=400, detail="Connect a database before asking AI questions.")

    connection = _get_org_connection(payload.connection_id, user, db)
    schema = json.loads(connection.schema_cache or "{}")

    try:
        sql = generate_sql(payload.question, schema)
    except QueryUnderstandingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    validation = validate_sql(sql, schema)
    if not validation.ok:
        raise HTTPException(status_code=400, detail=validation.error)

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
        payload.question, columns, rows, validation.requires_confirmation, query_type=validation.query_type
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
    return QueryGenerateResponse(
        query_id=log.id,
        sql=sql,
        query_type=validation.query_type,
        requires_confirmation=validation.requires_confirmation,
        summary=summary,
        columns=columns,
        rows=rows,
    )


@router.post("/{query_id}/confirm", response_model=QueryGenerateResponse)
def confirm(query_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = db.scalar(
        select(QueryLog).where(QueryLog.id == query_id, QueryLog.organization_id == user.organization_id)
    )
    if log is None:
        raise HTTPException(status_code=404, detail="Query not found")
    if log.status != "pending_confirmation":
        return QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="This write query was already confirmed.",
        )
    if log.connection_id is None:
        log.status = "executed"
        db.commit()
        return QueryGenerateResponse(
            query_id=log.id,
            sql=log.generated_sql,
            query_type=log.query_type,
            requires_confirmation=False,
            summary="Demo write query confirmed. Add a real connection to execute against MySQL.",
        )

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
    return QueryGenerateResponse(
        query_id=log.id,
        sql=log.generated_sql,
        query_type=log.query_type,
        requires_confirmation=False,
        summary="The confirmed write query executed successfully.",
        columns=columns,
        rows=rows,
    )
