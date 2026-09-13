"""add llm_model to system_settings

Revision ID: 003_llm_model
Revises: 002_tags_filename
Create Date: 2026-09-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_llm_model"
down_revision: Union[str, Sequence[str], None] = "002_tags_filename"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_LLM_MODEL = "deepseek-chat"


def upgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "llm_model",
                sa.String(),
                nullable=False,
                server_default=DEFAULT_LLM_MODEL,
            )
        )
    op.execute(
        sa.text(
            "UPDATE system_settings SET llm_model = :model WHERE id = 1"
        ).bindparams(model=DEFAULT_LLM_MODEL)
    )
    op.execute(
        sa.text(
            "INSERT INTO system_settings (id, api_key, api_base_url, llm_model, "
            "prompt_skills, primary_price, secondary_price) "
            "SELECT 1, '', '', :model, '{}', 0, 0 "
            "WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1)"
        ).bindparams(model=DEFAULT_LLM_MODEL)
    )


def downgrade() -> None:
    with op.batch_alter_table("system_settings") as batch_op:
        batch_op.drop_column("llm_model")
