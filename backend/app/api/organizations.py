import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import DBConnection, Organization, QueryLog, User
from app.schemas.dto import DashboardResponse

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/me")
def my_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.get(Organization, user.organization_id)


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
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "rows_returned": len((json.loads(log.result_preview or "{}") or {}).get("rows", [])),
                "preview": json.loads(log.result_preview or "{}"),
            }
            for log in logs
        ],
    }
