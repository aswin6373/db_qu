import logging
import time
from collections import defaultdict, deque

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api import auth, chat, connections, organizations, query
from app.core.config import get_settings
from app.db.session import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("querymind")

app = FastAPI(title="QueryMind API")
settings = get_settings()

logger.info(
    "starting service=%s environment=%s ai_provider=%s",
    settings.app_name,
    settings.environment,
    settings.llm_provider,
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window per-IP limiter.

    In-memory by design (no external store required); entries are swept
    periodically so idle clients cannot grow the table without bound.
    Schema changes belong to Alembic (`alembic upgrade head`), never to
    import-time DDL.
    """

    MAX_TRACKED_IPS = 10_000
    PRUNE_EVERY_REQUESTS = 256
    HEALTH_PATHS = {"/health", "/health/readiness"}

    def __init__(self, app, limit_per_minute: int):
        super().__init__(app)
        self.limit_per_minute = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._requests_since_prune = 0

    def _prune(self, hits: deque[float], now: float) -> None:
        while hits and now - hits[0] > 60.0:
            hits.popleft()

    def _prune_stale_ips(self, now: float) -> None:
        stale = [
            ip
            for ip, hits in self._hits.items()
            if not hits or now - hits[-1] > 60.0
        ]
        for ip in stale[: max(0, len(self._hits) - self.MAX_TRACKED_IPS // 2)]:
            del self._hits[ip]

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
        self._requests_since_prune += 1
        if (
            self._requests_since_prune >= self.PRUNE_EVERY_REQUESTS
            or len(self._hits) > self.MAX_TRACKED_IPS
        ):
            self._requests_since_prune = 0
            self._prune_stale_ips(now)
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
    # Deliberately terse: this endpoint is public, so it must not disclose
    # provider names or which secrets are configured.
    checks = {"database": "unknown"}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            checks["database"] = "ok"
    except Exception:
        logger.exception("readiness_database_check_failed")
        checks["database"] = "error"
    ready = checks["database"] == "ok"
    return JSONResponse({"ready": ready, "checks": checks}, status_code=200 if ready else 503)
