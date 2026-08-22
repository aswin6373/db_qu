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

## Project Structure

```text
backend/   FastAPI application and tests
frontend/  React TypeScript application
```

## Backend Quick Start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Open `http://localhost:8000/health`.

For Supabase setup, see `SUPABASE_SETUP.md`.

## Frontend Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open the local URL shown by Vite.

## Notes

The backend supports real LLM calls when an API key is configured. Without one, it uses a deterministic local fallback so the project can still be tested and demonstrated.
