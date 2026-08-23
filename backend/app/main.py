import logging
import time
from collections import defaultdict, deque

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from sqlalchemy import text

from app.api import auth, chat, connections, organizations, query
from app.core.config import get_settings
from app.db.session import engine
from app.models import entities

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("querymind")

app = FastAPI(title="QueryMind API")
settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    MAX_TRACKED_IPS = 10_000
    HEALTH_PATHS = {"/health", "/health/readiness"}

    def __init__(self, app, limit_per_minute: int):
        super().__init__(app)
        self.limit_per_minute = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, hits: deque[float], now: float) -> None:
        while hits and now - hits[0] > 60.0:
            hits.popleft()

    async def dispatch(self, request: Request, call_next):
        try:
            return await self._handle(request, call_next)
        except Exception:
            logger.exception("unhandled_error path=%s", request.url.path)
            return JSONResponse({"detail": "Internal server error"}, status_code=500)

    async def _handle(self, request: Request, call_next):
        if (
            self.limit_per_minute <= 0
            or request.url.path in self.HEALTH_PATHS
            or request.method == "OPTIONS"
        ):
            return await call_next(request)
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        if len(self._hits) > self.MAX_TRACKED_IPS:
            stale = [ip for ip, hits in self._hits.items() if not hits]
            for ip in stale[: len(self._hits) - self.MAX_TRACKED_IPS]:
                del self._hits[ip]
        hits = self._hits[client_ip]
        self._prune(hits, now)
        if len(hits) >= self.limit_per_minute:
            logger.warning("rate_limit_exceeded ip=%s path=%s", client_ip, request.url.path)
            return JSONResponse({"detail": "Too many requests"}, status_code=429)
        hits.append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware, limit_per_minute=settings.rate_limit_per_minute)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(
    "starting service=%s environment=%s ai_provider=%s",
    settings.app_name,
    settings.environment,
    settings.llm_provider,
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
