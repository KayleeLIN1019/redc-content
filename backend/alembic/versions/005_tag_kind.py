"""split tag catalog into ip and content kinds

Revision ID: 005_tag_kind
Revises: 004_max_concurrency
Create Date: 2026-09-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_tag_kind"
down_revision: Union[str, Sequence[str], None] = "004_max_concurrency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IP_TAGS = ("桃子", "佳佳")


def upgrade() -> None:
    with op.batch_alter_table("tag_catalog") as batch_op:
        batch_op.add_column(
            sa.Column("kind", sa.String(), nullable=False, server_default="content")
        )
        batch_op.create_check_constraint("ck_tag_catalog_kind", "kind IN ('ip', 'content')")

    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE tag_catalog SET kind = 'ip' WHERE name IN ('桃子', '佳佳')")
    )
    for name in IP_TAGS:
        existing = bind.execute(
            sa.text("SELECT id FROM tag_catalog WHERE name = :name"),
            {"name": name},
        ).fetchone()
        if existing is None:
            bind.execute(
                sa.text("INSERT INTO tag_catalog (name, kind) VALUES (:name, 'ip')"),
                {"name": name},
            )


def downgrade() -> None:
    with op.batch_alter_table("tag_catalog") as batch_op:
        batch_op.drop_constraint("ck_tag_catalog_kind", type_="check")
        batch_op.drop_column("kind")
