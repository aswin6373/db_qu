"""chat_sessions.context_summary

Rolling AI summary of the conversation, injected into later prompts so
follow-up answers keep their context (used by both web and WhatsApp chats).

Revision ID: 0010_context_summary
Revises: 0009_whatsapp_bindings
Create Date: 2026-08-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010_context_summary"
down_revision: Union[str, None] = "0009_whatsapp_bindings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("chat_sessions")}
    if "context_summary" in existing:
        return
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.add_column(sa.Column("context_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_column("context_summary")
