"""Guard against Alembic/ORM schema drift.

The application schema must be buildable from the migration chain alone.
This test runs `alembic upgrade head` against a throwaway SQLite database and
compares the resulting tables/columns with the SQLAlchemy models. It exists
because three columns (chat_sessions.updated_at, messages.query_id,
messages.result_json) once shipped in the ORM while missing from every
migration, which broke fresh deployments on first write.
"""

from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]

pytest.importorskip("alembic")


@pytest.fixture()
def migrated_engine(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config

    from app.core.config import get_settings

    db_path = tmp_path / "migrated.db"
    settings = get_settings()
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_path}")

    config = Config()
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(config, "head")

    from sqlalchemy import create_engine

    engine = create_engine(f"sqlite:///{db_path}")
    yield engine
    engine.dispose()


def _model_tables():
    from app.db.session import Base

    return Base.metadata.tables


def test_migration_chain_produces_every_model_table(migrated_engine):
    from sqlalchemy import inspect

    inspector = inspect(migrated_engine)
    actual = set(inspector.get_table_names())
    expected = set(_model_tables().keys())
    missing = expected - actual
    assert not missing, f"Tables missing after alembic upgrade head: {sorted(missing)}"


def test_migrated_columns_match_models(migrated_engine):
    from sqlalchemy import inspect

    inspector = inspect(migrated_engine)
    problems: list[str] = []
    for table_name, table in _model_tables().items():
        actual_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        for column in table.columns:
            if column.name not in actual_columns:
                problems.append(f"{table_name}.{column.name} missing")
                continue
            # Nullability is only compared for columns the app itself writes;
            # server-default timestamps are filled by the database either way
            # and the baseline migration intentionally leaves them nullable.
            if column.server_default is not None:
                continue
            if bool(column.nullable) != bool(actual_columns[column.name]["nullable"]):
                problems.append(
                    f"{table_name}.{column.name} nullability drift: "
                    f"model nullable={column.nullable}, db={actual_columns[column.name]['nullable']}"
                )
    assert not problems, "Schema drift detected:\n" + "\n".join(problems)


def test_chat_message_columns_exist_after_upgrade(migrated_engine):
    """Regression guard for the original drift incident."""
    from sqlalchemy import inspect

    inspector = inspect(migrated_engine)
    session_columns = {c["name"] for c in inspector.get_columns("chat_sessions")}
    message_columns = {c["name"] for c in inspector.get_columns("messages")}
    assert "updated_at" in session_columns
    assert {"query_id", "result_json"} <= message_columns
