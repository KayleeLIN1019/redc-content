from collections import Counter, defaultdict
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset, ContentPackage
from app.schemas import BenefitStat, DashboardOut, IpRevenueStat, PackagePublishIn, TagStat
from app.services.packages import list_packages
from app.services.settings import get_or_create_settings
from app.services.tags import list_tags

UNASSIGNED_IP = "未打 IP"


def _asset_ip(asset: Asset, ip_names: list[str]) -> str:
    tags = list(asset.category_tags or [])
    for name in ip_names:
        if name in tags:
            return name
    return UNASSIGNED_IP


def get_dashboard(db: Session) -> DashboardOut:
    packages = list_packages(db)
    published = [item for item in packages if item.status == "published"]
    primary_used = len(packages)
    secondary_used = sum(len(item.secondary_asset_ids or []) for item in packages)
    settings = get_or_create_settings(db)
    primary_price = float(settings.primary_price or 0)
    secondary_price = float(settings.secondary_price or 0)

    assets = list(db.scalars(select(Asset)))
    inventory_primary = sum(1 for item in assets if item.type == "primary")
    inventory_secondary = sum(1 for item in assets if item.type == "secondary")
    billable_assets = [item for item in assets if item.billable]
    billable_primary = sum(1 for item in billable_assets if item.type == "primary")
    billable_secondary = sum(1 for item in billable_assets if item.type == "secondary")
    excluded_count = len(assets) - len(billable_assets)

    catalog = list_tags(db)
    ip_names = [tag.name for tag in catalog if (tag.kind or "content") == "ip"]
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"primary": 0, "secondary": 0})
    for asset in billable_assets:
        buckets[_asset_ip(asset, ip_names)][asset.type] += 1

    ordered_ips = [*ip_names]
    if UNASSIGNED_IP in buckets:
        ordered_ips.append(UNASSIGNED_IP)
    revenue_by_ip = [
        IpRevenueStat(
            ip_name=name,
            primary_count=counts["primary"],
            secondary_count=counts["secondary"],
            primary_revenue=round(counts["primary"] * primary_price, 2),
            secondary_revenue=round(counts["secondary"] * secondary_price, 2),
        )
        for name in ordered_ips
        if (counts := buckets.get(name, {"primary": 0, "secondary": 0}))
        and (counts["primary"] or counts["secondary"])
    ]

    tag_counts: Counter[str] = Counter()
    for asset in assets:
        tag_counts.update(asset.category_tags or [])
    for tag in catalog:
        tag_counts.setdefault(tag.name, 0)

    all_benefits = Counter(item.benefit_point for item in packages)
    published_benefits = Counter(item.benefit_point for item in published)
    return DashboardOut(
        total_packages=len(packages),
        published_count=len(published),
        unpublished_count=len(packages) - len(published),
        inventory_primary=inventory_primary,
        inventory_secondary=inventory_secondary,
        billable_primary=billable_primary,
        billable_secondary=billable_secondary,
        excluded_count=excluded_count,
        primary_used=primary_used,
        secondary_used=secondary_used,
        primary_price=primary_price,
        secondary_price=secondary_price,
        estimated_revenue=round(
            billable_primary * primary_price + billable_secondary * secondary_price, 2
        ),
        revenue_by_ip=revenue_by_ip,
        benefit_distribution=[
            BenefitStat(benefit_point=name, count=count)
            for name, count in sorted(all_benefits.items(), key=lambda item: (-item[1], item[0]))
        ],
        published_by_benefit=[
            BenefitStat(benefit_point=name, count=count)
            for name, count in sorted(
                published_benefits.items(), key=lambda item: (-item[1], item[0])
            )
        ],
        assets_by_tag=[
            TagStat(tag=name, count=count)
            for name, count in sorted(tag_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    )


def publish_package(db: Session, package_id: int, payload: PackagePublishIn) -> ContentPackage:
    package = db.get(ContentPackage, package_id)
    if package is None:
        raise HTTPException(status_code=404, detail="套件不存在")
    package.status = "published"
    package.note_id = payload.note_id.strip() or None
    package.publish_time = payload.publish_time or datetime.now()
    db.commit()
    db.refresh(package)
    return package
