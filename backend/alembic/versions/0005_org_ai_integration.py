"""per-organization AI provider keys (bring your own key)

Revision ID: 0005_org_ai_integration
Revises: 0004_chat_connection
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_org_ai_integration"
down_revision: Union[str, None] = "0004_chat_connection"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("ai_provider", sa.String(length=20), nullable=True))
    op.add_column("organizations", sa.Column("encrypted_ai_key", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("ai_model", sa.String(length=120), nullable=True))
    op.add_column("organizations", sa.Column("ai_base_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "ai_base_url")
    op.drop_column("organizations", "ai_model")
    op.drop_column("organizations", "encrypted_ai_key")
    op.drop_column("organizations", "ai_provider")
