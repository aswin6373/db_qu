"""whatsapp_bindings table

Maps WhatsApp sender numbers to platform accounts (magic-link pairing).

Revision ID: 0009_whatsapp_bindings
Revises: 0008_db_type
Create Date: 2026-08-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009_whatsapp_bindings"
down_revision: Union[str, None] = "0008_db_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "whatsapp_bindings" in existing:
        return
    op.create_table(
        "whatsapp_bindings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("wa_number", sa.String(length=32), nullable=False, unique=True, index=True),
        sa.Column("linked_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("whatsapp_bindings")
