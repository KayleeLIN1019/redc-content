from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session

from app.models import Asset, TagCatalog


def list_tags(db: Session) -> list[TagCatalog]:
    return list(db.scalars(select(TagCatalog).order_by(TagCatalog.id.asc())))


def create_tag(db: Session, name: str) -> TagCatalog:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="标签名不能为空")
    existing = db.scalar(select(TagCatalog).where(TagCatalog.name == cleaned))
    if existing:
        raise HTTPException(status_code=409, detail="标签已存在")
    tag = TagCatalog(name=cleaned)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag_id: int) -> None:
    tag = db.get(TagCatalog, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在")
    name = tag.name
    assets = list(db.scalars(select(Asset)))
    for asset in assets:
        tags = [item for item in (asset.category_tags or []) if item != name]
        if tags != list(asset.category_tags or []):
            asset.category_tags = tags
            flag_modified(asset, "category_tags")
    db.delete(tag)
    db.commit()
