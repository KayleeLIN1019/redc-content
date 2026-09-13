from collections import Counter
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset, ContentPackage
from app.schemas import BenefitStat, DashboardOut, PackagePublishIn, TagStat
from app.services.packages import list_packages
from app.services.settings import get_or_create_settings
from app.services.tags import list_tags


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
    tag_counts: Counter[str] = Counter()
    for asset in assets:
        tag_counts.update(asset.category_tags or [])
    for tag in list_tags(db):
        tag_counts.setdefault(tag.name, 0)

    all_benefits = Counter(item.benefit_point for item in packages)
    published_benefits = Counter(item.benefit_point for item in published)
    return DashboardOut(
        total_packages=len(packages),
        published_count=len(published),
        unpublished_count=len(packages) - len(published),
        inventory_primary=inventory_primary,
        inventory_secondary=inventory_secondary,
        primary_used=primary_used,
        secondary_used=secondary_used,
        primary_price=primary_price,
        secondary_price=secondary_price,
        estimated_revenue=round(
            primary_used * primary_price + secondary_used * secondary_price, 2
        ),
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
