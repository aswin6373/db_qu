from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import auth, chat, connections, organizations, query
from app.core.config import get_settings
from app.db.session import engine
from app.models import entities

app = FastAPI(title="QueryMind API")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(connections.router)
app.include_router(query.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "querymind"}


@app.get("/health/readiness")
def readiness():
    checks = {
        "database": "unknown",
        "ai_provider": get_settings().llm_provider,
        "gemini_key": "set" if get_settings().gemini_api_key else "missing",
        "encryption_key": "set" if get_settings().fernet_key else "missing",
    }
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    ready = checks["database"] == "ok" and checks["encryption_key"] == "set"
    return {"ready": ready, "checks": checks}
