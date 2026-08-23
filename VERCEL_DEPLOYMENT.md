# Deploy QueryMind On Vercel

QueryMind should be deployed as two Vercel projects:

1. `db-qu-api` using the `backend` root directory.
2. `db-qu-web` using the `frontend` root directory.

## Important Limitation

Your current `Local MySQL` connection points to your Mac. Vercel cannot connect to `localhost` on your Mac. For deployed production, connect QueryMind to a cloud/public MySQL database, such as PlanetScale, Aiven, Railway MySQL, AWS RDS, DigitalOcean, or another reachable MySQL host.

## 1. Deploy Backend API

Create a Vercel project from GitHub:

```text
Root Directory: backend
Framework Preset: Other
```

Add these environment variables in Vercel:

```text
DATABASE_URL=postgresql+psycopg://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
DATABASE_SSL=true
JWT_SECRET_KEY=<strong-random-secret>
FERNET_KEY=<permanent-fernet-key>
CORS_ORIGINS=https://your-frontend.vercel.app
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-key>
GEMINI_MODEL=gemini-3.5-flash-lite
MYSQL_CONNECT_TIMEOUT=5
```

Generate `FERNET_KEY` locally:

```bash
cd backend
source .venv/bin/activate
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Before first deploy, make sure Supabase is migrated:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

After deploy, open:

```text
https://your-api.vercel.app/health/readiness
```

It should return:

```json
{"ready": true}
```

## 2. Deploy Frontend

Create a second Vercel project from the same GitHub repo:

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: pnpm run build
Output Directory: dist
```

Add this frontend environment variable:

```text
VITE_API_URL=https://your-api.vercel.app
```

Redeploy the frontend after setting `VITE_API_URL`.

## 3. Update Backend CORS

After frontend deployment, copy the frontend domain and update backend:

```text
CORS_ORIGINS=https://your-frontend.vercel.app
```

Then redeploy the backend.

## 4. Production Notes

- Do not use your local Mac MySQL database from Vercel.
- Use a low-privilege MySQL user for connected customer databases.
- Never rotate `FERNET_KEY` unless saved credentials are re-encrypted.
- Keep `DATABASE_URL`, `JWT_SECRET_KEY`, `FERNET_KEY`, and `GEMINI_API_KEY` secret.
