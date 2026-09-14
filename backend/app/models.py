from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        CheckConstraint("type IN ('primary', 'secondary')", name="ck_assets_type"),
        Index("ix_assets_type_is_used", "type", "is_used"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False, default="")
    category_tags: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class CompetitorNote(Base):
    __tablename__ = "competitor_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw_link: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_draft: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ContentPackage(Base):
    __tablename__ = "content_packages"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'exported', 'published')",
            name="ck_content_packages_status",
        ),
        UniqueConstraint("primary_asset_id", name="uq_content_packages_primary_asset_id"),
        Index("ix_content_packages_status", "status"),
        Index("ix_content_packages_ip_name", "ip_name"),
        Index("ix_content_packages_benefit_point", "benefit_point"),
        Index("ix_content_packages_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    ip_name: Mapped[str] = mapped_column(String, nullable=False)
    benefit_point: Mapped[str] = mapped_column(String, nullable=False)
    primary_asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False
    )
    secondary_asset_ids: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    competitor_note_id: Mapped[int] = mapped_column(
        ForeignKey("competitor_notes.id", ondelete="RESTRICT"), nullable=False
    )
    export_folder_name: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    publish_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class TagCatalog(Base):
    __tablename__ = "tag_catalog"
    __table_args__ = (
        CheckConstraint("kind IN ('ip', 'content')", name="ck_tag_catalog_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="content")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class SystemSetting(Base):
    __tablename__ = "system_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_system_settings_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_key: Mapped[str] = mapped_column(String, nullable=False, default="")
    api_base_url: Mapped[str] = mapped_column(String, nullable=False, default="")
    llm_model: Mapped[str] = mapped_column(String, nullable=False, default="deepseek-chat")
    max_concurrency: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    prompt_skills: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    primary_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    secondary_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
