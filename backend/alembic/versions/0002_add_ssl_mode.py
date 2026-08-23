"""add ssl_mode to db_connections

Revision ID: 0002_ssl_mode
Revises: 0001_initial
Create Date: 2026-08-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_ssl_mode"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "db_connections",
        sa.Column(
            "ssl_mode",
            sa.String(length=20),
            nullable=False,
            server_default="PREFERRED",
        ),
    )


def downgrade() -> None:
    op.drop_column("db_connections", "ssl_mode")
