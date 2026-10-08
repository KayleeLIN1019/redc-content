"""image_sets table for reusable secondary-image groups

Revision ID: 007_image_sets
Revises: 006_asset_billable
Create Date: 2026-09-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_image_sets"
down_revision: Union[str, Sequence[str], None] = "006_asset_billable"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "image_sets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("asset_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_image_sets_name"),
    )


def downgrade() -> None:
    op.drop_table("image_sets")
