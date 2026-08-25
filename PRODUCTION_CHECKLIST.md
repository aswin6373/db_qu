# Production Checklist

## Completed In This Baseline

- Platform tables are managed by Alembic migrations.
- Backend no longer auto-creates tables at startup.
- Supabase PostgreSQL stores platform users, connections, and query logs.
- Saved database passwords are encrypted with `FERNET_KEY`.
- Gemini 3.5 Flash-Lite is the primary model, with Ollama/local fallback.
- SQL validation strips inert comments, rejects MySQL executable comment
  directives (`/*! ... */`), denylists dangerous functions (including
  backtick-quoted forms), blocks system schemas, and enforces UPDATE/DELETE
  WHERE clauses at the outer statement level.
- Write queries require confirmation before execution; confirmations expire
  after `CONFIRMATION_TTL_MINUTES` and concurrent confirms cannot
  double-execute a write.
- Query results are capped at `MAX_RESULT_ROWS` server-side.
- MySQL connections/cursors are closed on every error path; SSH tunnels are
  reused per request and always torn down.
- Chats are scoped per user, not just per organization.
- The rate limiter trusts `X-Forwarded-For` only from `FORWARDED_ALLOW_IPS`.
- `/health/readiness` checks database connectivity (deliberately terse — it is
  public and must not disclose provider or secret state).
- A regression test runs the full Alembic chain against a scratch database and
  fails CI on any ORM/migration drift.

## Required Before Public Deployment

- Use a managed HTTPS host for frontend and backend.
- Set `ENVIRONMENT=production` so weak-secret validation activates at startup.
- Set strong secrets for `JWT_SECRET_KEY` (32+ chars) and `FERNET_KEY`.
- Run `alembic upgrade head` during deploys (the Docker image does this on boot).
- Restrict production CORS origins to your real frontend domain.
- Use a dedicated low-privilege MySQL user for each connected database.
- Add backups and restore testing for Supabase.
- Configure logging/monitoring for backend errors and slow queries.
- The built-in rate limiter (`RATE_LIMIT_PER_MINUTE`) is per process. Behind a
  proxy set `FORWARDED_ALLOW_IPS` to that proxy's IP; for multiple workers or
  replicas add rate limiting at the edge as well.

## Operational Rule

Never rotate `FERNET_KEY` unless you also re-encrypt every saved database credential.
