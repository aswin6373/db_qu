"""add chat_sessions.updated_at, messages.query_id, messages.result_json

These columns exist in the ORM models and in supabase/schema.sql but were
missing from every prior revision, so `alembic upgrade head` produced a schema
the application could not use (UndefinedColumn on message finalization and on
session list ordering).

Revision ID: 0007_chat_message_columns
Revises: 0006_query_log_user_nullable
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_chat_message_columns"
down_revision: Union[str, None] = "0006_query_log_user_nullable"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    """Databases provisioned out-of-band (supabase/schema.sql) or by a
    partially-applied concurrent deploy can hold columns the version table
    does not know about. Re-running such an ADD COLUMN crashed the container
    at boot (DuplicateColumn); guarding makes every step idempotent."""
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "updated_at" not in _existing_columns("chat_sessions"):
        with op.batch_alter_table("chat_sessions") as batch_op:
            batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
    message_columns = _existing_columns("messages")
    if {"query_id", "result_json"} - message_columns:
        with op.batch_alter_table("messages") as batch_op:
            if "query_id" not in message_columns:
                batch_op.add_column(sa.Column("query_id", sa.Integer(), nullable=True))
            if "result_json" not in message_columns:
                batch_op.add_column(sa.Column("result_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.drop_column("result_json")
        batch_op.drop_column("query_id")
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_column("updated_at")
