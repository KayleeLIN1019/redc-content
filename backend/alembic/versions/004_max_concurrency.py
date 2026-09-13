"""add max_concurrency to system_settings

Revision ID: 004_max_concurrency
Revises: 003_llm_model
Create Date: 2026-09-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_max_concurrency"
down_revision: Union[str, Sequence[str], None] = "003_llm_model"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "max_concurrency",
                sa.Integer(),
                nullable=False,
                server_default="8",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.drop_column("max_concurrency")
