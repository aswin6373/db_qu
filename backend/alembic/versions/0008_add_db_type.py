"""add db_type to db_connections

Marks which engine a saved connection points at ("mysql" or "postgres").
Existing rows are MySQL connections, hence the server default.

Revision ID: 0008_db_type
Revises: 0007_chat_message_columns
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008_db_type"
down_revision: Union[str, None] = "0007_chat_message_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("db_connections") as batch_op:
        batch_op.add_column(
            sa.Column(
                "db_type",
                sa.String(length=20),
                nullable=False,
                server_default="mysql",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("db_connections") as batch_op:
        batch_op.drop_column("db_type")
