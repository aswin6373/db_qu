# QueryMind Project Plan

QueryMind is built as a FastAPI backend and a React + TypeScript + Tailwind frontend. The initial release focuses on MySQL, organization isolation, natural-language SQL generation, SQL validation, confirmation before writes, and readable result display.

## Platform Database Schema

| Table | Purpose |
| --- | --- |
| organizations | Tenant workspace records |
| users | Authenticated users scoped to one organization |
| db_connections | Encrypted MySQL connection metadata |
| chat_sessions | Conversation groups |
| messages | User and assistant messages |
| query_logs | Generated SQL, execution state, and result preview |

## API Modules

| Module | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Organizations | `GET /organizations/me`, `GET /organizations/dashboard` |
| Connections | `POST /connections`, `GET /connections`, `GET /connections/{id}/schema` |
| AI Query | `POST /query/generate`, `POST /query/{query_id}/confirm` |
| Chat History | `GET /chat/sessions`, `GET /chat/sessions/{id}` |

## Safety Rules

- All user data is scoped by `organization_id`.
- Database passwords are encrypted before storage.
- Generated SQL is validated before execution.
- Multiple statements are rejected.
- Schema and admin operations such as `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, and `REVOKE` are rejected.
- `INSERT`, `UPDATE`, and `DELETE` are saved as pending and execute only after confirmation.

## Folder Structure

```text
backend/app/api/          Route modules
backend/app/core/         Config and security
backend/app/connectors/   Database connector abstraction
backend/app/db/           SQLAlchemy session setup
backend/app/models/       Platform database models
backend/app/schemas/      Request and response DTOs
backend/app/services/     Business logic
frontend/src/components/  Reusable UI
frontend/src/pages/       Screen-level components
frontend/src/lib/         API client helpers
frontend/src/types/       TypeScript types
```
