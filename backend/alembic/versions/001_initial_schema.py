"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-09-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("category_tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("type IN ('primary', 'secondary')", name="ck_assets_type"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assets_type_is_used", "assets", ["type", "is_used"])

    op.create_table(
        "competitor_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("raw_link", sa.String(), nullable=True),
        sa.Column("raw_content", sa.Text(), nullable=True),
        sa.Column("ai_draft", sa.Text(), nullable=True),
        sa.Column("final_content", sa.Text(), nullable=True),
        sa.Column("ip_name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "content_packages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("ip_name", sa.String(), nullable=False),
        sa.Column("benefit_point", sa.String(), nullable=False),
        sa.Column("primary_asset_id", sa.Integer(), nullable=False),
        sa.Column(
            "secondary_asset_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column("competitor_note_id", sa.Integer(), nullable=False),
        sa.Column("export_folder_name", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("publish_time", sa.DateTime(), nullable=True),
        sa.Column("note_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('draft', 'exported', 'published')",
            name="ck_content_packages_status",
        ),
        sa.ForeignKeyConstraint(
            ["primary_asset_id"],
            ["assets.id"],
            name="fk_content_packages_primary_asset_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["competitor_note_id"],
            ["competitor_notes.id"],
            name="fk_content_packages_competitor_note_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("primary_asset_id", name="uq_content_packages_primary_asset_id"),
    )
    op.create_index("ix_content_packages_status", "content_packages", ["status"])
    op.create_index("ix_content_packages_ip_name", "content_packages", ["ip_name"])
    op.create_index(
        "ix_content_packages_benefit_point", "content_packages", ["benefit_point"]
    )
    op.create_index("ix_content_packages_created_at", "content_packages", ["created_at"])

    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("api_key", sa.String(), nullable=False, server_default=""),
        sa.Column("api_base_url", sa.String(), nullable=False, server_default=""),
        sa.Column("prompt_skills", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("primary_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("secondary_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.CheckConstraint("id = 1", name="ck_system_settings_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO system_settings (id, api_key, api_base_url, prompt_skills, "
            "primary_price, secondary_price) VALUES (1, '', '', '{}', 0, 0)"
        )
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_index("ix_content_packages_created_at", table_name="content_packages")
    op.drop_index("ix_content_packages_benefit_point", table_name="content_packages")
    op.drop_index("ix_content_packages_ip_name", table_name="content_packages")
    op.drop_index("ix_content_packages_status", table_name="content_packages")
    op.drop_table("content_packages")
    op.drop_table("competitor_notes")
    op.drop_index("ix_assets_type_is_used", table_name="assets")
    op.drop_table("assets")
