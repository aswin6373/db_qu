"""bind chat sessions to a database connection

Revision ID: 0004_chat_connection
Revises: 0003_ssh_tunnel
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_chat_connection"
down_revision: Union[str, None] = "0003_ssh_tunnel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_sessions", sa.Column("connection_id", sa.Integer(), nullable=True))
    # batch_alter_table keeps this working on SQLite (table recreate) and Postgres alike.
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.create_foreign_key(
            "fk_chat_sessions_connection_id",
            "db_connections",
            ["connection_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_constraint("fk_chat_sessions_connection_id", type_="foreignkey")
    op.drop_column("chat_sessions", "connection_id")
