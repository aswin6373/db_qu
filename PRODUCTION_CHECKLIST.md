# QueryMind Production Checklist

## Completed In This Baseline

- Platform tables are managed by Alembic migrations.
- Backend no longer auto-creates tables at startup.
- Supabase PostgreSQL stores platform users, connections, and query logs.
- Saved database passwords are encrypted with `FERNET_KEY`.
- Gemini 3.5 Flash-Lite is the primary model, with Ollama/local fallback.
- SQL validation blocks unsupported and unsafe statement families.
- Write queries require confirmation before execution.
- Connection refresh/delete tools are available.
- Schema insights show readiness score, relationship hints, and improvement suggestions.
- `/health/readiness` checks database, AI provider, Gemini key, and encryption-key state.

## Required Before Public Deployment

- Use a managed HTTPS host for frontend and backend.
- Set strong secrets for `JWT_SECRET_KEY` and `FERNET_KEY`.
- Run `alembic upgrade head` during deploys.
- Restrict production CORS origins to your real frontend domain.
- Use a dedicated low-privilege MySQL user for each connected database.
- Add backups and restore testing for Supabase.
- Configure logging/monitoring for backend errors and slow queries.
- Add rate limits at the deployment edge or API gateway.

## Operational Rule

Never rotate `FERNET_KEY` unless you also re-encrypt every saved database credential.
