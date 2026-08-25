# QueryMind

QueryMind is an AI-powered database management platform that lets users query a connected MySQL database through natural language.

The first version includes:

- FastAPI backend with authentication and organization isolation
- Secure database connection records with encrypted passwords
- MySQL connector and schema discovery service
- SQL safety validation with confirmation required for write operations
- Chat-style query endpoint with result formatting
- React + TypeScript + Tailwind frontend
- Supabase PostgreSQL support for QueryMind platform data
- Gemini 3.5 Flash-Lite as the primary AI model, with Ollama fallback
- Alembic migrations for platform database schema changes
- Schema graph, AI-readiness score, relationship hints, and database improvement suggestions
- Connection refresh/delete tools with encrypted credential handling

## Project Structure

```text
backend/   FastAPI application and tests
frontend/  React TypeScript application
```

## Backend Quick Start

Requires Python **3.10+** (3.12 recommended).

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Open `http://localhost:8000/health`.
Use `http://localhost:8000/health/readiness` for deployment readiness checks.

For Supabase setup, see `SUPABASE_SETUP.md`.

## Frontend Quick Start

The frontend is managed with pnpm.

```bash
cd frontend
pnpm install
pnpm run dev
```

Open the local URL shown by Vite.

Open the local URL shown by Vite.

## Notes

The backend uses Gemini 3.5 Flash-Lite when `GEMINI_API_KEY` is configured. If Gemini is unavailable, it falls back to local Ollama, then to a deterministic local fallback so the project can still be tested and demonstrated.

## Production Baseline

QueryMind now avoids automatic table creation at startup. Manage platform database changes with Alembic:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

Required production environment values:

```text
ENVIRONMENT=production
DATABASE_URL=
DATABASE_SSL=true
JWT_SECRET_KEY=
FERNET_KEY=
CORS_ORIGINS=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
LLM_PROVIDER=gemini
```

Do not leave `FERNET_KEY` empty in production. It is required to decrypt saved database credentials after restarts.
`ENVIRONMENT=production` enables the startup validation that refuses weak secrets.

## Deployment

- Frontend: Vercel (see `VERCEL_DEPLOYMENT.md`)
- Backend API: Vercel (serverless) or Docker Compose (`docker-compose.yml`)
- Platform database: Supabase PostgreSQL
