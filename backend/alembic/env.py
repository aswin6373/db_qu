from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.core.config import get_settings
from app.db.session import Base
from app.models import entities

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Overlapping deploys (Render keeps the old instance up while the new one
# boots) used to run `alembic upgrade head` simultaneously: both planned the
# same steps and the loser crashed on DuplicateColumn before uvicorn ever
# started, killing the container mid-traffic. A session-level advisory lock
# makes the second booter wait, then see head and no-op.
ADVISORY_LOCK_KEY = 72340172431


def _database_url() -> str:
    return get_settings().sqlalchemy_database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _database_url()
    connect_args = {}
    if configuration["sqlalchemy.url"].startswith("postgresql") and get_settings().database_ssl:
        connect_args["sslmode"] = "require"
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as lock_connection:
        # Advisory locks are PostgreSQL-only; SQLite (local/tests) skips them.
        is_postgres = lock_connection.dialect.name == "postgresql"
        if is_postgres:
            lock_connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": ADVISORY_LOCK_KEY})
        try:
            with connectable.connect() as connection:
                context.configure(connection=connection, target_metadata=target_metadata)

                with context.begin_transaction():
                    context.run_migrations()
        finally:
            if is_postgres:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": ADVISORY_LOCK_KEY})


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
