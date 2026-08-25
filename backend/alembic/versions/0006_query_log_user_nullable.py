"""make query_logs.user_id nullable so removed members' history is kept unattributed

Revision ID: 0006_query_log_user_nullable
Revises: 0005_org_ai_integration
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_query_log_user_nullable"
down_revision: Union[str, None] = "0005_org_ai_integration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table keeps this working on SQLite (table recreate) and Postgres alike.
    with op.batch_alter_table("query_logs") as batch_op:
        batch_op.alter_column(
            "user_id",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    # Restoring NOT NULL fails on databases that contain unattributed logs;
    # reassign or delete those rows manually before downgrading.
    with op.batch_alter_table("query_logs") as batch_op:
        batch_op.alter_column(
            "user_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
