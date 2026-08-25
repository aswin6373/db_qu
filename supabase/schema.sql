-- Reference snapshot of the platform schema.
-- Alembic (backend/alembic/versions) is the source of truth for production
-- changes; run `alembic upgrade head` instead of executing this file.

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  ai_provider VARCHAR(20),
  encrypted_ai_key TEXT,
  ai_model VARCHAR(120),
  ai_base_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_id ON users(id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

CREATE TABLE IF NOT EXISTS db_connections (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  name VARCHAR(120) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 3306,
  username VARCHAR(255) NOT NULL,
  encrypted_password TEXT NOT NULL,
  database_name VARCHAR(255) NOT NULL,
  ssl_mode VARCHAR(20) NOT NULL DEFAULT 'PREFERRED',
  ssh_host VARCHAR(255),
  ssh_port INTEGER NOT NULL DEFAULT 22,
  ssh_username VARCHAR(255),
  encrypted_ssh_password TEXT,
  schema_cache TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_db_connections_id ON db_connections(id);
CREATE INDEX IF NOT EXISTS ix_db_connections_organization_id ON db_connections(organization_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  connection_id INTEGER REFERENCES db_connections(id),
  title VARCHAR(255) NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_chat_sessions_id ON chat_sessions(id);
CREATE INDEX IF NOT EXISTS ix_chat_sessions_organization_id ON chat_sessions(organization_id);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  sql TEXT,
  query_id INTEGER,
  result_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_messages_id ON messages(id);

CREATE TABLE IF NOT EXISTS query_logs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER REFERENCES users(id),
  connection_id INTEGER REFERENCES db_connections(id),
  natural_language TEXT NOT NULL,
  generated_sql TEXT NOT NULL,
  query_type VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  result_preview TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_query_logs_id ON query_logs(id);
CREATE INDEX IF NOT EXISTS ix_query_logs_organization_id ON query_logs(organization_id);
