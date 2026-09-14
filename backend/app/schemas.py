from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.constants import MAX_LLM_CONCURRENCY


AssetType = Literal["primary", "secondary"]


class AssetOut(BaseModel):
    id: int
    type: AssetType
    file_path: str
    original_filename: str
    storage_path: str
    category_tags: list[str]
    is_used: bool
    billable: bool
    selectable: bool
    type_locked: bool
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetListOut(BaseModel):
    items: list[AssetOut]


class AssetTagsUpdate(BaseModel):
    category_tags: list[str] | None = None
    type: AssetType | None = None
    billable: bool | None = None


class AssetBatchIn(BaseModel):
    asset_ids: list[int] = Field(min_length=1)
    type: AssetType | None = None
    billable: bool | None = None
    add_tags: list[str] = Field(default_factory=list)
    remove_tags: list[str] = Field(default_factory=list)


class TagOut(BaseModel):
    id: int
    name: str
    kind: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    name: str
    kind: str = "content"


class TagListOut(BaseModel):
    items: list[TagOut]


class SettingsOut(BaseModel):
    api_key_masked: str
    has_api_key: bool
    api_base_url: str
    llm_model: str
    max_concurrency: int
    prompt_skills: dict[str, Any]
    primary_price: float
    secondary_price: float


class SettingsUpdate(BaseModel):
    api_key: str = ""
    api_base_url: str = ""
    llm_model: str = ""
    max_concurrency: int = Field(default=MAX_LLM_CONCURRENCY, ge=1, le=MAX_LLM_CONCURRENCY)
    prompt_skills: dict[str, Any] = Field(default_factory=dict)
    primary_price: Decimal = Decimal("0")
    secondary_price: Decimal = Decimal("0")


class LlmTestIn(BaseModel):
    api_key: str = ""
    api_base_url: str = ""
    llm_model: str = ""


class LlmTestOut(BaseModel):
    ok: bool
    model: str
    latency_ms: int
    reply: str


class NoteRewriteIn(BaseModel):
    ip_name: str
    raw_link: str | None = None
    raw_content: str | None = None


class NoteParseLinkIn(BaseModel):
    url: str


class NoteParseLinkOut(BaseModel):
    url: str
    content: str


class NoteRewriteBatchItem(BaseModel):
    raw_link: str | None = None
    raw_content: str | None = None


class NoteRewriteBatchIn(BaseModel):
    ip_name: str
    items: list[NoteRewriteBatchItem]


class NoteConfirmIn(BaseModel):
    final_content: str


class NoteOut(BaseModel):
    id: int
    ip_name: str
    raw_link: str | None
    raw_content: str | None
    ai_draft: str | None
    final_content: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteRewriteBatchError(BaseModel):
    index: int
    detail: str


class NoteRewriteBatchOut(BaseModel):
    items: list[NoteOut]
    errors: list[NoteRewriteBatchError]


class NoteListOut(BaseModel):
    items: list[NoteOut]


class PackageCreateIn(BaseModel):
    title: str
    ip_name: str
    benefit_point: str
    primary_asset_id: int
    secondary_asset_ids: list[int] = Field(default_factory=list)
    competitor_note_id: int


class PackageOut(BaseModel):
    id: int
    title: str
    ip_name: str
    benefit_point: str
    primary_asset_id: int
    secondary_asset_ids: list[int]
    competitor_note_id: int
    export_folder_name: str | None
    status: str
    publish_time: datetime | None
    note_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PackageListOut(BaseModel):
    items: list[PackageOut]


class PackageExportIn(BaseModel):
    package_ids: list[int]


class PackagePublishIn(BaseModel):
    note_id: str = ""
    publish_time: datetime | None = None


class BenefitStat(BaseModel):
    benefit_point: str
    count: int


class TagStat(BaseModel):
    tag: str
    count: int


class IpRevenueStat(BaseModel):
    ip_name: str
    primary_count: int
    secondary_count: int
    primary_revenue: float
    secondary_revenue: float


class DashboardOut(BaseModel):
    total_packages: int
    published_count: int
    unpublished_count: int
    inventory_primary: int
    inventory_secondary: int
    billable_primary: int
    billable_secondary: int
    excluded_count: int
    primary_used: int
    secondary_used: int
    primary_price: float
    secondary_price: float
    estimated_revenue: float
    revenue_by_ip: list[IpRevenueStat]
    benefit_distribution: list[BenefitStat]
    published_by_benefit: list[BenefitStat]
    assets_by_tag: list[TagStat]
