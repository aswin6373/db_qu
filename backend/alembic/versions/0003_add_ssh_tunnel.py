"""add ssh tunnel columns to db_connections

Revision ID: 0003_ssh_tunnel
Revises: 0002_ssl_mode
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_ssh_tunnel"
down_revision: Union[str, None] = "0002_ssl_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("db_connections", sa.Column("ssh_host", sa.String(length=255), nullable=True))
    op.add_column(
        "db_connections",
        sa.Column("ssh_port", sa.Integer(), nullable=False, server_default="22"),
    )
    op.add_column("db_connections", sa.Column("ssh_username", sa.String(length=255), nullable=True))
    op.add_column("db_connections", sa.Column("encrypted_ssh_password", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("db_connections", "encrypted_ssh_password")
    op.drop_column("db_connections", "ssh_username")
    op.drop_column("db_connections", "ssh_port")
    op.drop_column("db_connections", "ssh_host")
