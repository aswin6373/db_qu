"""query_logs audit fields

affected_tables: JSON list of table names the statement touched (Changes page).
confirmed_at / confirmed_by: who confirmed a pending write, and when.

Revision ID: 0011_audit_fields
Revises: 0010_context_summary
Create Date: 2026-08-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011_audit_fields"
down_revision: Union[str, None] = "0010_context_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("query_logs")}
    with op.batch_alter_table("query_logs") as batch_op:
        if "affected_tables" not in existing:
            batch_op.add_column(sa.Column("affected_tables", sa.Text(), nullable=True))
        if "confirmed_at" not in existing:
            batch_op.add_column(sa.Column("confirmed_at", sa.DateTime(), nullable=True))
        if "confirmed_by" not in existing:
            batch_op.add_column(sa.Column("confirmed_by", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("query_logs") as batch_op:
        batch_op.drop_column("confirmed_by")
        batch_op.drop_column("confirmed_at")
        batch_op.drop_column("affected_tables")
