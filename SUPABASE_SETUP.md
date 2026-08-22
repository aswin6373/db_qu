# Supabase Setup For QueryMind

QueryMind uses Supabase PostgreSQL as the platform database. This stores QueryMind's own data:

- users
- organizations
- saved database connections
- chat sessions
- messages
- query logs

The MySQL database you connect inside QueryMind is still separate. QueryMind can store its own platform data in Supabase while querying customer/demo data from MySQL.

## 1. Create Supabase Project

Create a project in Supabase and open:

```text
Project Settings -> Database
```

Copy the PostgreSQL connection string. Prefer the direct connection string for local development.

## 2. Configure Backend

Create or edit:

```text
backend/.env
```

Use:

```text
APP_NAME=QueryMind
DATABASE_URL=postgresql+psycopg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
DATABASE_SSL=true
JWT_SECRET_KEY=change-this-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
FERNET_KEY=
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
MYSQL_CONNECT_TIMEOUT=5
```

Replace `<password>` and `<project-ref>` with your Supabase values.

## 3. Create Tables

Option A: let the backend create tables when it starts.

Option B: open Supabase SQL Editor and run:

```text
supabase/schema.sql
```

Option B is clearer for review because you can see exactly which platform tables exist.

## 4. Run Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 5. Run Frontend

```bash
cd frontend
pnpm run dev
```

## Current Database Split

```text
Supabase PostgreSQL
  QueryMind users, organizations, saved connections, query history

Local/remote MySQL
  Customer/demo data that users ask AI questions about
```
