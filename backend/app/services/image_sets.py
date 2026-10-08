from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Asset, ImageSet
from app.schemas import ImageSetCreateIn


def create_image_set(db: Session, payload: ImageSetCreateIn) -> ImageSet:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请填写套图名称")

    asset_ids: list[int] = []
    for asset_id in payload.asset_ids:
        asset = db.get(Asset, asset_id)
        if asset is None or asset.type != "secondary":
            raise HTTPException(status_code=400, detail=f"次图不存在或类型错误: {asset_id}")
        if asset_id not in asset_ids:
            asset_ids.append(asset_id)

    image_set = ImageSet(name=name, asset_ids=asset_ids)
    db.add(image_set)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="已存在同名套图，请换个名字") from exc
    db.refresh(image_set)
    return image_set


def list_image_sets(db: Session) -> list[ImageSet]:
    stmt = select(ImageSet).order_by(ImageSet.created_at.desc(), ImageSet.id.desc())
    return list(db.scalars(stmt))


def delete_image_set(db: Session, image_set_id: int) -> None:
    image_set = db.get(ImageSet, image_set_id)
    if image_set is None:
        raise HTTPException(status_code=404, detail="套图不存在")
    db.delete(image_set)
    db.commit()
