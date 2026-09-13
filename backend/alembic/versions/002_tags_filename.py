"""tag catalog and original filename

Revision ID: 002_tags_filename
Revises: 001_initial
Create Date: 2026-09-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_tags_filename"
down_revision: Union[str, Sequence[str], None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_TAGS = [
    "户型图",
    "效果图",
    "施工现场",
    "材料细节",
    "报价清单",
    "对比图",
    "团队",
    "案例",
    "承诺凭证",
    "其它",
]


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(
            sa.Column("original_filename", sa.String(), nullable=False, server_default="")
        )
    op.create_table(
        "tag_catalog",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    for name in SEED_TAGS:
        op.execute(
            sa.text("INSERT INTO tag_catalog (name) VALUES (:name)").bindparams(name=name)
        )


def downgrade() -> None:
    op.drop_table("tag_catalog")
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_column("original_filename")
